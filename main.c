#include <string.h>
#include <time.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/timers.h"
#include "esp_netif.h"
#include "esp_eth.h"
#include "esp_event.h"
#include "esp_log.h"
#include "driver/gpio.h"
#include "sdkconfig.h"
#include "cJSON.h"
#include "lwip/err.h"
#include "lwip/sockets.h"
#include "lwip/sys.h"
#include "lwip/netdb.h"

// Ethernet configuration
#define ETH_PHY_ADDR 1
#define ETH_MDC_GPIO 23
#define ETH_MDIO_GPIO 18
#define PORT 80

// Elevator Node Configuration
#define SERVER_IP "192.168.1.11"  // Change to your monitoring server IP
#define SERVER_PORT 5000
#define ACK_LISTEN_PORT 5001  // Port to listen for acknowledgments from server
#define CONFIG_LISTEN_PORT 5002  // Port to listen for config/registration responses
#define HEARTBEAT_INTERVAL_MS 5000  // 5 seconds

#define MAX_UNITS 5

// Emergency Button GPIOs (HIGH = pressed)
#define BUTTON_GPIO_1 15
#define BUTTON_GPIO_2 16
#define BUTTON_GPIO_3 13
#define BUTTON_GPIO_4 4
#define BUTTON_GPIO_5 14
// Note: GPIO 39 and 36 are input-only pins without internal pull-down
// Removed from this list to avoid configuration errors

#define DEBOUNCE_MS 50  // Debounce time in milliseconds

static const char *TAG = "elevator_node";
static int req_count = 0;
static char local_ip[16] = "0.0.0.0";
static char local_mac[18] = "";

static bool registered = false;
static char node_id[64] = "";
static char building[64] = "";
static int floor_level = 0;
static char unit_ids[MAX_UNITS][64];
static int unit_count = 0;

static bool emergency_active = false;
static bool emergency_button_pressed = false;  // Current button state
static char active_unit_id[64] = "";
static bool send_heartbeat_flag = false;  // Set by timer, processed by task
static TimerHandle_t heartbeat_timer = NULL;
static int udp_sock = -1;
static int ack_listen_sock = -1;
static int config_sock = -1;
static uint32_t last_config_received_time = 0;  // Ticks when we last got a config response
static uint32_t registration_backoff_ms = 5000;  // Start with 5 seconds between registration requests

/** Event handler for Ethernet events */
static void eth_event_handler(void *arg, esp_event_base_t event_base,
                              int32_t event_id, void *event_data)
{
    uint8_t mac_addr[6] = {0};
    esp_eth_handle_t eth_handle = *(esp_eth_handle_t *)event_data;

    switch (event_id) {
    case ETHERNET_EVENT_CONNECTED:
        esp_eth_ioctl(eth_handle, ETH_CMD_G_MAC_ADDR, mac_addr);
        ESP_LOGI(TAG, "Ethernet Link Up");
        ESP_LOGI(TAG, "Ethernet HW Addr %02x:%02x:%02x:%02x:%02x:%02x",
                 mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);

        snprintf(local_mac, sizeof(local_mac), "%02x:%02x:%02x:%02x:%02x:%02x",
                 mac_addr[0], mac_addr[1], mac_addr[2], mac_addr[3], mac_addr[4], mac_addr[5]);
        break;
    case ETHERNET_EVENT_DISCONNECTED:
        ESP_LOGI(TAG, "Ethernet Link Down");
        break;
    case ETHERNET_EVENT_START:
        ESP_LOGI(TAG, "Ethernet Started");
        break;
    case ETHERNET_EVENT_STOP:
        ESP_LOGI(TAG, "Ethernet Stopped");
        break;
    default:
        break;
    }
}

static void heartbeat_timer_start(void)
{
    if (heartbeat_timer == NULL) return;
    xTimerStart(heartbeat_timer, 0);
}

static void heartbeat_timer_stop(void)
{
    if (heartbeat_timer == NULL) return;
    xTimerStop(heartbeat_timer, 0);
    send_heartbeat_flag = false;
}

/** Event handler for IP_EVENT_ETH_GOT_IP */
static void got_ip_event_handler(void *arg, esp_event_base_t event_base,
                                 int32_t event_id, void *event_data)
{
    ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
    const esp_netif_ip_info_t *ip_info = &event->ip_info;

    ESP_LOGI(TAG, "Ethernet Got IP Address");
    ESP_LOGI(TAG, "~~~~~~~~~~~");
    ESP_LOGI(TAG, "ETHIP:" IPSTR, IP2STR(&ip_info->ip));
    ESP_LOGI(TAG, "ETHMASK:" IPSTR, IP2STR(&ip_info->netmask));
    ESP_LOGI(TAG, "ETHGW:" IPSTR, IP2STR(&ip_info->gw));
    ESP_LOGI(TAG, "~~~~~~~~~~~");
    
    // Store local IP for UDP messages
    snprintf(local_ip, sizeof(local_ip), IPSTR, IP2STR(&ip_info->ip));
    ESP_LOGI(TAG, "Local IP stored: %s", local_ip);
}

// Send UDP message to monitoring server
static void send_udp_message(const char *message)
{
    if (udp_sock < 0) {
        ESP_LOGW(TAG, "UDP socket not initialized");
        return;
    }

    struct sockaddr_in dest_addr;
    dest_addr.sin_addr.s_addr = inet_addr(SERVER_IP);
    dest_addr.sin_family = AF_INET;
    dest_addr.sin_port = htons(SERVER_PORT);

    int err = sendto(udp_sock, message, strlen(message), 0, 
                     (struct sockaddr *)&dest_addr, sizeof(dest_addr));
    if (err < 0) {
        ESP_LOGE(TAG, "Failed to send UDP message: errno %d", errno);
    } else {
        ESP_LOGI(TAG, "Sent UDP: %s", message);
    }
}

// Get current timestamp in ISO 8601 format
static void get_timestamp(char *buffer, size_t size)
{
    time_t now;
    struct tm timeinfo;
    time(&now);
    gmtime_r(&now, &timeinfo);
    strftime(buffer, size, "%Y-%m-%dT%H:%M:%S.000Z", &timeinfo);
}

// Send heartbeat signal
static void send_heartbeat(void)
{
    if (!registered || node_id[0] == '\0') {
        return;
    }

    char timestamp[32];
    char message[512];
    
    get_timestamp(timestamp, sizeof(timestamp));
    
    snprintf(message, sizeof(message),
             "{\"type\":\"heartbeat\","
             "\"node_id\":\"%s\","
             "\"elevator_id\":\"%s\","
             "\"building\":\"%s\","
             "\"floor\":%d,"
             "\"timestamp\":\"%s\","
             "\"status\":\"online\","
             "\"ip_address\":\"%s\"}",
             node_id, node_id, building, floor_level, timestamp, local_ip);
    
    send_udp_message(message);
}

// Send emergency signal
static void send_emergency(bool active, const char *elevator_unit_id)
{
    if (!registered || node_id[0] == '\0') {
        return;
    }

    char timestamp[32];
    char message[512];
    
    get_timestamp(timestamp, sizeof(timestamp));
    
    snprintf(message, sizeof(message),
             "{\"type\":\"emergency\","
             "\"node_id\":\"%s\","
             "\"elevator_id\":\"%s\","
             "\"building\":\"%s\","
             "\"floor\":%d,"
             "\"timestamp\":\"%s\","
             "\"status\":\"%s\","
             "\"ip_address\":\"%s\"}",
             node_id, elevator_unit_id && elevator_unit_id[0] ? elevator_unit_id : node_id, building, floor_level, timestamp,
             active ? "active" : "acknowledged", local_ip);
    
    send_udp_message(message);
}

static void send_registration_request(void)
{
    char message[256];
    snprintf(message, sizeof(message),
             "{\"type\":\"registration_request\","
             "\"ip_address\":\"%s\","
             "\"mac_address\":\"%s\","
             "\"buttons\":%d}",
             local_ip,
             local_mac[0] ? local_mac : "unknown",
             MAX_UNITS);
    send_udp_message(message);
}

static void send_config_request(void)
{
    if (config_sock < 0) return;
    char message[256];
    snprintf(message, sizeof(message),
             "{\"type\":\"config_request\","
             "\"ip_address\":\"%s\","
             "\"mac_address\":\"%s\","
             "\"buttons\":%d}",
             local_ip,
             local_mac[0] ? local_mac : "unknown",
             MAX_UNITS);

    struct sockaddr_in dest_addr;
    dest_addr.sin_addr.s_addr = inet_addr(SERVER_IP);
    dest_addr.sin_family = AF_INET;
    dest_addr.sin_port = htons(SERVER_PORT);

    sendto(config_sock, message, strlen(message), 0, (struct sockaddr *)&dest_addr, sizeof(dest_addr));
}

// Heartbeat timer callback - just sets flag, actual send happens in task
static void heartbeat_timer_callback(TimerHandle_t xTimer)
{
    send_heartbeat_flag = true;
}

// GPIO button monitoring task
static void gpio_monitor_task(void *pvParameters)
{
    const int button_gpios[] = {BUTTON_GPIO_1, BUTTON_GPIO_2, BUTTON_GPIO_3, 
                                  BUTTON_GPIO_4, BUTTON_GPIO_5};
    const int num_buttons = sizeof(button_gpios) / sizeof(button_gpios[0]);
    bool last_states[5] = {false};
    uint32_t debounce_times[5] = {0};
    
    ESP_LOGI(TAG, "GPIO monitor task started");
    
    while (1) {
        uint32_t current_time = xTaskGetTickCount() * portTICK_PERIOD_MS;

        // If we're not registered, don't trigger alarms/heartbeats.
        if (!registered) {
            vTaskDelay(pdMS_TO_TICKS(250));
            continue;
        }
        
        // Only monitor buttons that have assigned elevator units
        // This ensures deleted elevators don't trigger emergencies
        int active_button_count = unit_count < num_buttons ? unit_count : num_buttons;
        
        bool any_valid_pressed = false;
        int first_pressed_button = -1;
        
        for (int i = 0; i < num_buttons; i++) {
            int level = gpio_get_level(button_gpios[i]);
            bool pressed = (level == 1);  // HIGH = pressed
            
            // Debounce logic
            if (pressed != last_states[i]) {
                if (current_time - debounce_times[i] > DEBOUNCE_MS) {
                    last_states[i] = pressed;
                    debounce_times[i] = current_time;
                    
                    if (pressed) {
                        // Only log if this button has an assigned unit
                        if (i < active_button_count && unit_ids[i][0]) {
                            ESP_LOGW(TAG, "🚨 Emergency button %d (GPIO %d) PRESSED - Unit: %s", 
                                    i + 1, button_gpios[i], unit_ids[i]);
                        } else {
                            ESP_LOGI(TAG, "Button %d (GPIO %d) pressed but no unit assigned - ignoring",
                                    i + 1, button_gpios[i]);
                        }
                    } else {
                        ESP_LOGI(TAG, "Emergency button %d (GPIO %d) released", 
                                i + 1, button_gpios[i]);
                    }
                }
            }
            
            // Only count as valid press if this button has an assigned unit
            if (pressed && i < active_button_count && unit_ids[i][0]) {
                any_valid_pressed = true;
                if (first_pressed_button < 0) {
                    first_pressed_button = i;
                }
            }
        }
        
        // Update button state
        emergency_button_pressed = any_valid_pressed;
        
        // ONLY activate emergency when button first pressed AND has valid unit
        // Emergency stays LATCHED until acknowledged from control room
        if (any_valid_pressed && !emergency_active && first_pressed_button >= 0) {
            ESP_LOGE(TAG, "╔═══════════════════════════════════════════╗");
            ESP_LOGE(TAG, "║   🚨 EMERGENCY ACTIVATED 🚨              ║");
            ESP_LOGE(TAG, "║   Waiting for control room acknowledgment ║");
            ESP_LOGE(TAG, "╚═══════════════════════════════════════════╝");
            emergency_active = true;

            // Use the first pressed button's unit ID
            const char *unit_id = unit_ids[first_pressed_button];
            strncpy(active_unit_id, unit_id, sizeof(active_unit_id) - 1);
            active_unit_id[sizeof(active_unit_id) - 1] = '\0';
            send_emergency(true, unit_id);
        }
        // Button release does NOT clear emergency - only manual acknowledge does
        
        // Check if timer wants us to send heartbeat
        if (send_heartbeat_flag) {
            send_heartbeat_flag = false;
            send_heartbeat();
        }
        
        vTaskDelay(pdMS_TO_TICKS(10));  // Poll every 10ms
    }
}

// UDP acknowledgment listener task
static void ack_listener_task(void *pvParameters)
{
    struct sockaddr_in listen_addr;
    listen_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    listen_addr.sin_family = AF_INET;
    listen_addr.sin_port = htons(ACK_LISTEN_PORT);
    
    ack_listen_sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (ack_listen_sock < 0) {
        ESP_LOGE(TAG, "Failed to create ACK listener socket: errno %d", errno);
        vTaskDelete(NULL);
        return;
    }
    
    int err = bind(ack_listen_sock, (struct sockaddr *)&listen_addr, sizeof(listen_addr));
    if (err < 0) {
        ESP_LOGE(TAG, "Failed to bind ACK listener: errno %d", errno);
        close(ack_listen_sock);
        vTaskDelete(NULL);
        return;
    }
    
    ESP_LOGI(TAG, "✓ Listening for acknowledgments on port %d", ACK_LISTEN_PORT);
    
    char rx_buffer[512];
    struct sockaddr_in source_addr;
    socklen_t socklen = sizeof(source_addr);
    
    while (1) {
        int len = recvfrom(ack_listen_sock, rx_buffer, sizeof(rx_buffer) - 1, 0,
                          (struct sockaddr *)&source_addr, &socklen);
        
        if (len < 0) {
            ESP_LOGE(TAG, "recvfrom failed: errno %d", errno);
            continue;
        }
        
        rx_buffer[len] = 0;  // Null terminate
        ESP_LOGI(TAG, "Received acknowledgment: %s", rx_buffer);
        
        // Check if this is an acknowledgment for our node
        if (strstr(rx_buffer, "\"type\":\"acknowledgment\"") != NULL &&
            registered && node_id[0] && strstr(rx_buffer, "\"node_id\"") != NULL &&
            strstr(rx_buffer, node_id) != NULL) {
            
            if (emergency_active) {
                ESP_LOGI(TAG, "╔═══════════════════════════════════════════╗");
                ESP_LOGI(TAG, "║   ✓ EMERGENCY ACKNOWLEDGED               ║");
                ESP_LOGI(TAG, "║   Emergency cleared by control room       ║");
                ESP_LOGI(TAG, "╚═══════════════════════════════════════════╝");
                
                emergency_active = false;
                const char *unit_id = (active_unit_id[0] ? active_unit_id : node_id);
                active_unit_id[0] = '\0';
                send_emergency(false, unit_id);  // Confirm acknowledgment
            }
        }
    }
}

// Initialize UDP socket
static void init_udp_socket(void)
{
    udp_sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (udp_sock < 0) {
        ESP_LOGE(TAG, "Failed to create UDP socket: errno %d", errno);
    } else {
        ESP_LOGI(TAG, "UDP socket created successfully");
    }
}

static void init_config_socket(void)
{
    struct sockaddr_in listen_addr;
    listen_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    listen_addr.sin_family = AF_INET;
    listen_addr.sin_port = htons(CONFIG_LISTEN_PORT);

    config_sock = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
    if (config_sock < 0) {
        ESP_LOGE(TAG, "Failed to create config socket: errno %d", errno);
        return;
    }

    int err = bind(config_sock, (struct sockaddr *)&listen_addr, sizeof(listen_addr));
    if (err < 0) {
        ESP_LOGE(TAG, "Failed to bind config socket: errno %d", errno);
        close(config_sock);
        config_sock = -1;
        return;
    }

    struct timeval tv;
    tv.tv_sec = 0;
    tv.tv_usec = 250 * 1000;
    setsockopt(config_sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    ESP_LOGI(TAG, "✓ Listening for config on port %d", CONFIG_LISTEN_PORT);
}

static void clear_config(void)
{
    registered = false;
    node_id[0] = '\0';
    building[0] = '\0';
    floor_level = 0;
    unit_count = 0;
    for (int i = 0; i < MAX_UNITS; i++) {
        unit_ids[i][0] = '\0';
    }
    emergency_active = false;
    active_unit_id[0] = '\0';
    heartbeat_timer_stop();
}

static void apply_config_from_json(const char *json)
{
    cJSON *root = cJSON_Parse(json);
    if (!root) {
        return;
    }

    const cJSON *type = cJSON_GetObjectItemCaseSensitive(root, "type");
    if (!cJSON_IsString(type) || !type->valuestring || strcmp(type->valuestring, "config") != 0) {
        cJSON_Delete(root);
        return;
    }

    const cJSON *reg = cJSON_GetObjectItemCaseSensitive(root, "registered");
    if (!cJSON_IsBool(reg)) {
        cJSON_Delete(root);
        return;
    }

    if (!cJSON_IsTrue(reg)) {
        if (registered) {
            ESP_LOGW(TAG, "Device unregistered by server; entering dormant mode");
        }
        clear_config();
        cJSON_Delete(root);
        return;
    }

    const cJSON *node = cJSON_GetObjectItemCaseSensitive(root, "node");
    if (!cJSON_IsObject(node)) {
        cJSON_Delete(root);
        return;
    }

    const cJSON *nodeId = cJSON_GetObjectItemCaseSensitive(node, "id");
    if (!cJSON_IsString(nodeId) || !nodeId->valuestring) {
        cJSON_Delete(root);
        return;
    }

    const cJSON *buildingJson = cJSON_GetObjectItemCaseSensitive(node, "building");
    const cJSON *floorJson = cJSON_GetObjectItemCaseSensitive(node, "floor");

    // Units ordered by server (unit_index ASC)
    unit_count = 0;
    const cJSON *units = cJSON_GetObjectItemCaseSensitive(root, "units");
    if (cJSON_IsArray(units)) {
        int size = cJSON_GetArraySize(units);
        for (int i = 0; i < size && unit_count < MAX_UNITS; i++) {
            const cJSON *u = cJSON_GetArrayItem(units, i);
            if (!cJSON_IsObject(u)) continue;
            const cJSON *uid = cJSON_GetObjectItemCaseSensitive(u, "id");
            if (!cJSON_IsString(uid) || !uid->valuestring) continue;
            strncpy(unit_ids[unit_count], uid->valuestring, sizeof(unit_ids[unit_count]) - 1);
            unit_ids[unit_count][sizeof(unit_ids[unit_count]) - 1] = '\0';
            unit_count++;
        }
    }

    strncpy(node_id, nodeId->valuestring, sizeof(node_id) - 1);
    node_id[sizeof(node_id) - 1] = '\0';

    if (cJSON_IsString(buildingJson) && buildingJson->valuestring && buildingJson->valuestring[0]) {
        strncpy(building, buildingJson->valuestring, sizeof(building) - 1);
        building[sizeof(building) - 1] = '\0';
    } else {
        strncpy(building, "Unassigned", sizeof(building) - 1);
        building[sizeof(building) - 1] = '\0';
    }

    if (cJSON_IsNumber(floorJson)) {
        floor_level = floorJson->valueint;
    }

    if (!registered) {
        ESP_LOGI(TAG, "Registered as %s (%s floor %d) with %d unit(s)", node_id, building, floor_level, unit_count);
        registered = true;
        heartbeat_timer_start();
        send_heartbeat();
    } else {
        // Already registered - config update received (unit list may have changed)
        ESP_LOGI(TAG, "Config updated: %s (%s floor %d) with %d unit(s)", node_id, building, floor_level, unit_count);
    }

    cJSON_Delete(root);
}

static void config_task(void *pvParameters)
{
    ESP_LOGI(TAG, "Config task started");
    uint32_t last_registration_sent = 0;
    
    while (1) {
        if (local_ip[0] == '0') {
            vTaskDelay(pdMS_TO_TICKS(500));
            continue;
        }

        uint32_t now = xTaskGetTickCount() * portTICK_PERIOD_MS;

        // Only send registration request if:
        // 1. Not registered
        // 2. Haven't received config recently (within last 10 seconds)
        // 3. Haven't sent a registration request recently (backoff)
        if (!registered) {
            uint32_t time_since_config = now - last_config_received_time;
            uint32_t time_since_registration = now - last_registration_sent;
            
            if (time_since_config > 10000 && time_since_registration >= registration_backoff_ms) {
                send_registration_request();
                last_registration_sent = now;
                // Increase backoff up to 30 seconds
                if (registration_backoff_ms < 30000) {
                    registration_backoff_ms += 5000;
                }
            }
        } else {
            // Reset backoff when registered
            registration_backoff_ms = 5000;
        }

        // Always send config request to get latest config (less frequently when registered)
        send_config_request();

        // Read as many config replies as available (short timeout)
        if (config_sock >= 0) {
            char rx_buffer[768];
            struct sockaddr_in source_addr;
            socklen_t socklen = sizeof(source_addr);
            for (int i = 0; i < 4; i++) {
                int len = recvfrom(config_sock, rx_buffer, sizeof(rx_buffer) - 1, 0,
                                   (struct sockaddr *)&source_addr, &socklen);
                if (len <= 0) break;
                rx_buffer[len] = 0;
                if (strstr(rx_buffer, "\"type\":\"config\"") != NULL) {
                    last_config_received_time = xTaskGetTickCount() * portTICK_PERIOD_MS;
                    apply_config_from_json(rx_buffer);
                }
            }
        }

        vTaskDelay(pdMS_TO_TICKS(registered ? 15000 : 3000));
    }
}

// Initialize GPIO buttons
static void init_gpio_buttons(void)
{
    const gpio_num_t button_gpios[] = {BUTTON_GPIO_1, BUTTON_GPIO_2, BUTTON_GPIO_3, 
                                        BUTTON_GPIO_4, BUTTON_GPIO_5};
    const int num_buttons = sizeof(button_gpios) / sizeof(button_gpios[0]);
    
    gpio_config_t io_conf = {
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_ENABLE,  // Pull down so HIGH = pressed
        .intr_type = GPIO_INTR_DISABLE,
    };
    
    for (int i = 0; i < num_buttons; i++) {
        io_conf.pin_bit_mask = (1ULL << button_gpios[i]);
        gpio_config(&io_conf);
        ESP_LOGI(TAG, "Configured GPIO %d as input with pull-down", button_gpios[i]);
    }
}

// Start heartbeat timer
static void start_heartbeat_timer(void)
{
    heartbeat_timer = xTimerCreate("heartbeat", 
                                   pdMS_TO_TICKS(HEARTBEAT_INTERVAL_MS),
                                   pdTRUE,  // Auto-reload
                                   NULL,
                                   heartbeat_timer_callback);
    
    if (heartbeat_timer != NULL) {
        // Do not start until the server registers us
        ESP_LOGI(TAG, "Heartbeat timer created (interval: %d ms)", HEARTBEAT_INTERVAL_MS);
    } else {
        ESP_LOGE(TAG, "Failed to create heartbeat timer");
    }
}

static void tcp_server_task(void *pvParameters)
{
    char addr_str[128];
    int addr_family = AF_INET;
    int ip_protocol = 0;
    int keepAlive = 1;
    int keepIdle = 5;
    int keepInterval = 5;
    int keepCount = 3;
    struct sockaddr_storage dest_addr;

    struct sockaddr_in *dest_addr_ip4 = (struct sockaddr_in *)&dest_addr;
    dest_addr_ip4->sin_addr.s_addr = htonl(INADDR_ANY);
    dest_addr_ip4->sin_family = AF_INET;
    dest_addr_ip4->sin_port = htons(PORT);
    ip_protocol = IPPROTO_IP;

    int listen_sock = socket(addr_family, SOCK_STREAM, ip_protocol);
    if (listen_sock < 0) {
        ESP_LOGE(TAG, "Unable to create socket: errno %d", errno);
        vTaskDelete(NULL);
        return;
    }
    int opt = 1;
    setsockopt(listen_sock, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    ESP_LOGI(TAG, "Socket created");

    int err = bind(listen_sock, (struct sockaddr *)&dest_addr, sizeof(dest_addr));
    if (err != 0) {
        ESP_LOGE(TAG, "Socket unable to bind: errno %d", errno);
        ESP_LOGE(TAG, "IPPROTO: %d", addr_family);
        goto CLEAN_UP;
    }
    ESP_LOGI(TAG, "Socket bound, port %d", PORT);

    err = listen(listen_sock, 1);
    if (err != 0) {
        ESP_LOGE(TAG, "Error occurred during listen: errno %d", errno);
        goto CLEAN_UP;
    }

    while (1) {
        ESP_LOGI(TAG, "Socket listening");

        struct sockaddr_storage source_addr;
        socklen_t addr_len = sizeof(source_addr);
        int sock = accept(listen_sock, (struct sockaddr *)&source_addr, &addr_len);
        if (sock < 0) {
            ESP_LOGE(TAG, "Unable to accept connection: errno %d", errno);
            break;
        }

        setsockopt(sock, SOL_SOCKET, SO_KEEPALIVE, &keepAlive, sizeof(int));
        setsockopt(sock, IPPROTO_TCP, TCP_KEEPIDLE, &keepIdle, sizeof(int));
        setsockopt(sock, IPPROTO_TCP, TCP_KEEPINTVL, &keepInterval, sizeof(int));
        setsockopt(sock, IPPROTO_TCP, TCP_KEEPCNT, &keepCount, sizeof(int));

        if (source_addr.ss_family == PF_INET) {
            inet_ntoa_r(((struct sockaddr_in *)&source_addr)->sin_addr, addr_str, sizeof(addr_str) - 1);
        }

        ESP_LOGI(TAG, "Socket accepted ip address: %s", addr_str);

        char rx_buffer[128];
        int len = recv(sock, rx_buffer, sizeof(rx_buffer) - 1, 0);
        if (len < 0) {
            ESP_LOGE(TAG, "Error occurred during receiving: errno %d", errno);
        } else if (len == 0) {
            ESP_LOGI(TAG, "Connection closed");
        } else {
            rx_buffer[len] = 0;
            ESP_LOGI(TAG, "Received %d bytes: %s", len, rx_buffer);

            req_count++;
            char response[512];
            snprintf(response, sizeof(response),
                     "HTTP/1.1 200 OK\r\n"
                     "Content-Type: text/html\r\n"
                     "Connection: close\r\n"
                     "Refresh: 20\r\n"
                     "\r\n"
                     "<!DOCTYPE HTML>\r\n"
                     "<html>\r\n"
                     "<h2>Elevator Emergency Node - ESP32</h2>\r\n"
                     "Node: %s<br>\r\n"
                     "Registered: %s<br>\r\n"
                     "Emergency: %s<br>\r\n"
                     "Requests: %d<br>\r\n"
                     "</html>\r\n",
                     (registered && node_id[0]) ? node_id : "unregistered",
                     registered ? "true" : "false",
                     emergency_active ? "ACTIVE" : "Normal",
                     req_count);

            int total = strlen(response);
            int to_write = total;
            int offset = 0;
            while (to_write > 0) {
                int written = send(sock, response + offset, to_write, 0);
                if (written < 0) {
                    ESP_LOGE(TAG, "Error occurred during sending: errno %d", errno);
                    break;
                }
                to_write -= written;
                offset += written;
            }
            ESP_LOGI(TAG, "Sent %d/%d bytes", offset, total);
        }

        shutdown(sock, SHUT_RDWR);
        close(sock);
    }

CLEAN_UP:
    close(listen_sock);
    vTaskDelete(NULL);
}

void app_main(void)
{
    ESP_LOGI(TAG, "╔═══════════════════════════════════════════════════════╗");
    ESP_LOGI(TAG, "║      ELEVATOR EMERGENCY NODE - ESP32-ETH01            ║");
    ESP_LOGI(TAG, "╠═══════════════════════════════════════════════════════╣");
    ESP_LOGI(TAG, "║  Server:      %-40s║", SERVER_IP);
    ESP_LOGI(TAG, "║  Status:      %-40s║", "booting");
    ESP_LOGI(TAG, "╚═══════════════════════════════════════════════════════╝");

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    esp_netif_config_t cfg = ESP_NETIF_DEFAULT_ETH();
    esp_netif_t *eth_netif = esp_netif_new(&cfg);

    eth_mac_config_t mac_config = ETH_MAC_DEFAULT_CONFIG();
    eth_phy_config_t phy_config = ETH_PHY_DEFAULT_CONFIG();

    phy_config.phy_addr = ETH_PHY_ADDR;
    phy_config.reset_gpio_num = -1;

    eth_esp32_emac_config_t esp32_emac_config = ETH_ESP32_EMAC_DEFAULT_CONFIG();
    esp32_emac_config.smi_gpio.mdc_num = ETH_MDC_GPIO;
    esp32_emac_config.smi_gpio.mdio_num = ETH_MDIO_GPIO;
    esp32_emac_config.clock_config.rmii.clock_mode = EMAC_CLK_OUT;
    esp32_emac_config.clock_config.rmii.clock_gpio = EMAC_CLK_OUT_180_GPIO;

    esp_eth_mac_t *mac = esp_eth_mac_new_esp32(&esp32_emac_config, &mac_config);
    esp_eth_phy_t *phy = esp_eth_phy_new_lan87xx(&phy_config);

    esp_eth_config_t config = ETH_DEFAULT_CONFIG(mac, phy);
    esp_eth_handle_t eth_handle = NULL;
    ESP_ERROR_CHECK(esp_eth_driver_install(&config, &eth_handle));

    esp_eth_netif_glue_handle_t eth_glue = esp_eth_new_netif_glue(eth_handle);
    ESP_ERROR_CHECK(esp_netif_attach(eth_netif, eth_glue));
    ESP_ERROR_CHECK(esp_event_handler_register(ETH_EVENT, ESP_EVENT_ANY_ID, &eth_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_ETH_GOT_IP, &got_ip_event_handler, NULL));

    // Configure static IP
    esp_netif_dhcpc_stop(eth_netif);
    esp_netif_ip_info_t ip_info;
    IP4_ADDR(&ip_info.ip, 192, 168, 1, 232);
    IP4_ADDR(&ip_info.gw, 192, 168, 1, 1);
    IP4_ADDR(&ip_info.netmask, 255, 255, 255, 0);
    esp_netif_set_ip_info(eth_netif, &ip_info);
    snprintf(local_ip, sizeof(local_ip), "192.168.1.232");

    ESP_ERROR_CHECK(esp_eth_start(eth_handle));

    ESP_LOGI(TAG, "Initializing elevator node systems...");
    
    init_gpio_buttons();
    init_udp_socket();
    init_config_socket();
    
    vTaskDelay(pdMS_TO_TICKS(2000));
    
    start_heartbeat_timer();
    // Do not send heartbeat until registered; config_task will poll and then start heartbeats.
    
    xTaskCreate(gpio_monitor_task, "gpio_monitor", 4096, NULL, 5, NULL);
    xTaskCreate(ack_listener_task, "ack_listener", 4096, NULL, 5, NULL);
    xTaskCreate(config_task, "config", 4096, NULL, 5, NULL);
    xTaskCreate(tcp_server_task, "tcp_server", 4096, (void *)AF_INET, 5, NULL);
    
    ESP_LOGI(TAG, "✓ Elevator node initialized successfully");
    ESP_LOGI(TAG, "  Monitoring %d emergency buttons (GPIOs 15,16,13,4,14)", 5);
    ESP_LOGI(TAG, "  Will start heartbeats after registration");
    ESP_LOGI(TAG, "  Emergency stays LATCHED until manually acknowledged");
}
