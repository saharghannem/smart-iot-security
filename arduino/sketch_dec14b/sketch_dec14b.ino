#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
//------lcd cofig---
LiquidCrystal_I2C lcd(0x27, 16, 2);
// ---------- CONFIGURATION ----------
#include "config.h"

// ---------- BROCHAGE ----------
#define SS_PIN     5
#define RST_PIN    21
#define PIR_PIN    13
#define VIB_PIN    27
#define LED_ROUGE  4
#define LED_VERTE  2
#define BUZZER     14
#define SERVO_PIN  22

// ---------- OBJETS ----------
MFRC522 rfid(SS_PIN, RST_PIN);
Servo myServo;

// ---------- SECURITY  ----------
const int MOUVEMENT_SEUIL_SUSPICION = 15;   
const int MOUVEMENT_SEUIL_INTRUSION = 30;   
const int VIBRATION_SEUIL_FORCE = 3;       
const unsigned long FENETRE_TEMPS_MS = 10000; // 10 secondes

// ---------- COMPTEURS ----------
int compteur_mouvement = 0;
int compteur_vibration = 0;
unsigned long timer_fenetre = 0;

// Door state tracking
bool doorIsOpen = false;
unsigned long doorOpenTime = 0;

// Firebase Auth Token
String firebaseIdToken = "";
unsigned long tokenExpiry = 0;

// Cooldown pour éviter spam d'alertes
unsigned long last_suspicious_alert = 0;
unsigned long last_force_alert = 0;
const unsigned long ALERT_COOLDOWN = 30000;

// ---------- SETUP ----------
void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(PIR_PIN, INPUT);
  pinMode(VIB_PIN, INPUT_PULLUP);
  pinMode(LED_ROUGE, OUTPUT);
  pinMode(LED_VERTE, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  // SERVO SETUP
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);
  myServo.setPeriodHertz(50);
  myServo.attach(SERVO_PIN, 500, 2500);
  
  Serial.println("🔧 Test servo...");
  myServo.write(90);  // Open
  delay(1000);
  myServo.write(0);   // Close
  delay(500);
  Serial.println("Servo OK");

  SPI.begin();
  rfid.PCD_Init();
  rfid.PCD_SetAntennaGain(MFRC522::RxGain_max);

  timer_fenetre = millis();
  connectWiFi();
  
  Serial.println("\n Test de connexion ESP32-CAM...");
  testESP32CAMConnection();
  
  if (authenticateFirebase()) {
    Serial.println(" Firebase authentifié ");
    configTime(3600, 0, "pool.ntp.org", "time.nist.gov");
    delay(2000);
  } else {
    Serial.println("Échec auth Firebase");
  }

}

// ---------- FONCTIONS ----------
void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connexion WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(500);
  }
  Serial.println("\n WiFi CONNECTÉ !");
  Serial.print("IP: "); Serial.println(WiFi.localIP());
}

void testESP32CAMConnection() {
  HTTPClient http;
  String url = "http://" + String(ESP32CAM_IP) + "/";
  
  if (!http.begin(url)) {
    Serial.println(" Connexion ESP32-CAM impossible");
    return;
  }
  
  http.setTimeout(5000);
  int code = http.GET();
  
  if (code == 200) {
    Serial.println(" ESP32-CAM accessible");
  } else {
    Serial.println(" ESP32-CAM non accessible (code: " + String(code) + ")");
  }
  http.end();
}

bool authenticateFirebase() {
  HTTPClient http;
  String url = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + String(FIREBASE_API_KEY);
  
  StaticJsonDocument<200> doc;
  doc["email"] = FIREBASE_USER_EMAIL;
  doc["password"] = FIREBASE_USER_PASSWORD;
  doc["returnSecureToken"] = true;
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  int code = http.POST(jsonStr);
  
  if (code == 200) {
    String response = http.getString();
    StaticJsonDocument<1024> respDoc;
    deserializeJson(respDoc, response);
    
    firebaseIdToken = respDoc["idToken"].as<String>();
    tokenExpiry = millis() + 3600000;
    
    http.end();
    return true;
  }
  http.end();
  return false;
}

void checkAndRefreshToken() {
  if (millis() > tokenExpiry - 300000) {
    authenticateFirebase();
  }
}

String getFormattedDateTime() {
  time_t now = time(nullptr);
  struct tm timeinfo;
  
  if (!getLocalTime(&timeinfo)) {
    return String(millis());
  }
  
  char timeStr[30];
  strftime(timeStr, sizeof(timeStr), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(timeStr);
}

// ASYNC Firebase update (non-blocking)
void sendToFirestoreAsync(String collection, String jsonData) {
  // Store for later sending in background
  static String pendingData[5];
  static String pendingCollections[5];
  static int pendingCount = 0;
  
  if (pendingCount < 5) {
    pendingData[pendingCount] = jsonData;
    pendingCollections[pendingCount] = collection;
    pendingCount++;
  }
}

void sendToFirestore(String collection, String jsonData) {
  if (jsonData.length() == 0) return;
  
  checkAndRefreshToken();
  
  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/" + String(FIREBASE_PROJECT_ID) + "/databases/(default)/documents/" + collection;
  
  StaticJsonDocument<512> firestoreDoc;
  StaticJsonDocument<512> dataDoc;
  deserializeJson(dataDoc, jsonData);
  
  JsonObject fields = firestoreDoc.createNestedObject("fields");
  
  for (JsonPair kv : dataDoc.as<JsonObject>()) {
    JsonObject field = fields.createNestedObject(kv.key().c_str());
    
    if (kv.value().is<const char*>()) {
      field["stringValue"] = kv.value().as<const char*>();
    } else if (kv.value().is<int>() || kv.value().is<long>()) {
      field["integerValue"] = kv.value().as<String>();
    } else if (kv.value().is<bool>()) {
      field["booleanValue"] = kv.value().as<bool>();
    }
  }
  
  String firestoreJson;
  serializeJson(firestoreDoc, firestoreJson);
  
  http.begin(url);
  http.addHeader("Authorization", "Bearer " + firebaseIdToken);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000); // 3 second timeout
  
  http.POST(firestoreJson);
  http.end();
}

String captureImageFromCam() {
  HTTPClient http;
  String url = "http://" + String(ESP32CAM_IP) + "/capture";
  http.begin(url);
  http.setTimeout(10000);
  
  int code = http.GET();
  
  if (code != 200) {
    Serial.println("Image capture failed: HTTP " + String(code));
    http.end();
    return "";
  }
  
  String imageData = http.getString();
  http.end();
  
  if (imageData.length() < 1000) {
    Serial.println(" Image too small: " + String(imageData.length()) + " bytes");
    return "";
  }
  
  Serial.println(" Image captured: " + String(imageData.length()) + " bytes");
  return imageData;
}


// Optimization: Integrated Capture + Verify to reduce network roundtrips
bool captureAndVerifyFace(String rfid_uid) {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  
  digitalWrite(LED_VERTE, HIGH); 
  Serial.println(" ÉTAPE 2: Capture du visage en cours...");
  
  HTTPClient http;
  // On utilise l'endpoint rfid-capture qui ordonne à l'ESP32-CAM de prendre la photo et l'envoyer au backend
  String url = "http://" + String(ESP32CAM_IP) + "/rfid-capture?uid=" + rfid_uid;
  http.setTimeout(25000); // Augmentation du timeout pour les réseaux lents
  
  if (http.begin(url)) {
    Serial.println(" Envoi de la requête de capture à l'ESP32-CAM...");
    int code = http.GET();
    
    if (code == 200) {
      String payload = http.getString();
      Serial.println("Réponse reçue du backend: " + payload);
      
      StaticJsonDocument<512> doc;
      DeserializationError error = deserializeJson(doc, payload);
      if (!error) {
        bool granted = doc["access_granted"] | false;
        String reason = doc["reason"] | "N/A";
        
        if (granted) {
          Serial.println(" Visage RECONNU avec succès !");
        } else {
          Serial.println(" Visage NON reconnu. Raison: " + reason);
        }
        
        http.end();
        digitalWrite(LED_VERTE, LOW);
        return granted;
      } else {
        Serial.println(" Erreur d'analyse JSON de la réponse.");
      }
    } else {
      Serial.println("Échec de la capture (Code HTTP: " + String(code) + ")");
    }
    http.end();
  } else {
    Serial.println("Connexion à l'ESP32-CAM impossible.");
  }
  
  digitalWrite(LED_VERTE, LOW);
  return false;
}


String uploadImageToFirebase(String imageData, String uid) {
  if (imageData.length() == 0) return "";
  
  checkAndRefreshToken();
  
  HTTPClient http;
  String url = "http://" + String(BACKEND_IP) + ":5000/upload-image";
  
  String boundary = "------------------------1234567890abcdef";
  String body = "--" + boundary + "\r\n";
  body += "Content-Disposition: form-data; name=\"uid\"\r\n\r\n";
  body += uid + "\r\n";
  body += "--" + boundary + "\r\n";
  body += "Content-Disposition: form-data; name=\"image\"; filename=\"alert.jpg\"\r\n";
  body += "Content-Type: image/jpeg\r\n\r\n";
  body += imageData;
  body += "\r\n--" + boundary + "--\r\n";
  
  http.begin(url);
  http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary);
  http.addHeader("Content-Length", String(body.length()));
  
  int code = http.POST(body);
  if (code == 200) {
    String response = http.getString();
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, response);
    if (!err && doc.containsKey("url")) {
      http.end();
      return doc["url"].as<String>();
    }
  }
  
  http.end();
  return "";
}

void sendDeniedAccessAlert(String uid, String reason = "access_denied_face") {
  StaticJsonDocument<300> alert;
  alert["type"] = reason;
  alert["uid"] = uid;
  alert["timestamp"] = millis();
  alert["datetime"] = getFormattedDateTime();
  alert["device_id"] = "ESP32_Principal";
  alert["location"] = "Main Entrance";
  
  if (reason == "visage_non_reconnu") {
    Serial.println(" Capturing image for alert...");
    String imageData = captureImageFromCam();
    
    if (imageData.length() > 1000) {
      Serial.println(" Uploading image...");
      String imageUrl = uploadImageToFirebase(imageData, uid);
      if (imageUrl.length() > 0) {
        alert["image_url"] = imageUrl;
      }
    }
  }
  
  String jsonStr;
  serializeJson(alert, jsonStr);
  sendToFirestore("security_alerts", jsonStr);
}

void sendSuspiciousMovementAlert(int movement_count) {
  if (millis() - last_suspicious_alert < ALERT_COOLDOWN) {
    return;
  }
  last_suspicious_alert = millis();
  
  Serial.println("MOUVEMENT SUSPECT!");
  
  String imageData = captureImageFromCam();
  String imageUrl = "";
  
  if (imageData.length() > 1000) {
    imageUrl = uploadImageToFirebase(imageData, "pir_alert_" + String(millis()));
  }
  
  StaticJsonDocument<400> alert;
  alert["type"] = "suspicious_movement";
  alert["source_sensor"] = "PIR";
  alert["movement_count"] = movement_count;
  alert["threshold"] = MOUVEMENT_SEUIL_SUSPICION;
  alert["timestamp"] = millis();
  alert["datetime"] = getFormattedDateTime();
  alert["device_id"] = "ESP32_Principal";
  alert["location"] = "Main Entrance";
  alert["severity"] = "medium";
  
  if (imageUrl.length() > 0) {
    alert["image_url"] = imageUrl;
  }
  
  String jsonStr;
  serializeJson(alert, jsonStr);
  sendToFirestore("security_alerts", jsonStr);
  
  // Warning
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_ROUGE, HIGH);
    tone(BUZZER, 1500, 200);
    delay(200);
    digitalWrite(LED_ROUGE, LOW);
    delay(100);
  }
}

void sendIntrusionAlert(int movement_count) {
  Serial.println("INTRUSION CONFIRMÉE!");
  
  String imageData = captureImageFromCam();
  String imageUrl = "";
  
  if (imageData.length() > 1000) {
    imageUrl = uploadImageToFirebase(imageData, "intrusion_" + String(movement_count));
  }
  
  StaticJsonDocument<400> alert;
  alert["type"] = "intrusion_detected";
  alert["movement_count"] = movement_count;
  alert["threshold"] = MOUVEMENT_SEUIL_INTRUSION;
  alert["timestamp"] = millis();
  alert["datetime"] = getFormattedDateTime();
  alert["device_id"] = "ESP32_Principal";
  alert["location"] = "Main Entrance";
  alert["severity"] = "critical";
  
  if (imageUrl.length() > 0) {
    alert["image_url"] = imageUrl;
  }
  
  String jsonStr;
  serializeJson(alert, jsonStr);
  sendToFirestore("security_alerts", jsonStr);
  
  // Alarm
  for (int i = 0; i < 10; i++) {
    digitalWrite(LED_ROUGE, HIGH);
    tone(BUZZER, 2500, 100);
    delay(100);
    digitalWrite(LED_ROUGE, LOW);
    delay(50);
  }
}

void sendForcingAttemptAlert(int vibration_count) {
  if (millis() - last_force_alert < ALERT_COOLDOWN) {
    return;
  }
  last_force_alert = millis();
  
  Serial.println("TENTATIVE DE FORÇAGE!");
  
  String imageData = captureImageFromCam();
  String imageUrl = "";
  
  if (imageData.length() > 1000) {
    imageUrl = uploadImageToFirebase(imageData, "forcing_" + String(vibration_count));
  }
  
  StaticJsonDocument<400> alert;
  alert["type"] = "door_forcing_attempt";
  alert["vibration_count"] = vibration_count;
  alert["threshold"] = VIBRATION_SEUIL_FORCE;
  alert["timestamp"] = millis();
  alert["datetime"] = getFormattedDateTime();
  alert["device_id"] = "ESP32_Principal";
  alert["location"] = "Main Entrance";
  alert["severity"] = "high";
  alert["door_state"] = doorIsOpen ? "open" : "closed";
  
  if (imageUrl.length() > 0) {
    alert["image_url"] = imageUrl;
  }
  
  String jsonStr;
  serializeJson(alert, jsonStr);
  sendToFirestore("security_alerts", jsonStr);
  
  // Alarm
  for (int i = 0; i < 5; i++) {
    digitalWrite(LED_ROUGE, HIGH);
    tone(BUZZER, 2500, 150);
    delay(150);
    digitalWrite(LED_ROUGE, LOW);
    delay(100);
  }
}

void updateDoorStatusFirestore(bool isOpen) {
  if (WiFi.status() != WL_CONNECTED) return;
  checkAndRefreshToken();

  HTTPClient http;
  String url = "https://firestore.googleapis.com/v1/projects/" + String(FIREBASE_PROJECT_ID) + "/databases/(default)/documents/doors/main_door?updateMask.fieldPaths=status&updateMask.fieldPaths=lastActionAt&updateMask.fieldPaths=datetime";
  
  StaticJsonDocument<512> doc;
  JsonObject fields = doc.createNestedObject("fields");
  
  fields.createNestedObject("status")["stringValue"] = isOpen ? "open" : "closed";
  fields.createNestedObject("lastActionAt")["integerValue"] = String(millis());
  fields.createNestedObject("datetime")["stringValue"] = getFormattedDateTime();
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  
  http.begin(url);
  http.addHeader("Authorization", "Bearer " + firebaseIdToken);
  http.addHeader("Content-Type", "application/json");
  http.PATCH(jsonStr);
  http.end();
}

void openDoor() {
  if (!doorIsOpen) {
    Serial.println(" Ouverture de la porte...");
    myServo.write(90);
    doorIsOpen = true;
    doorOpenTime = millis();
    Serial.println("Porte ouverte!");
    updateDoorStatusFirestore(true);
  }
}

void closeDoor() {
  if (doorIsOpen) {
    Serial.println(" Fermeture de la porte...");
    myServo.write(0);
    doorIsOpen = false;
    Serial.println("Porte fermée!");
    updateDoorStatusFirestore(false);
  }
}

void triggerEmergencyMode() {
  Serial.println(" MODE URGENCE ACTIVÉ !");
  
  // 1. Ouvrir physiquement la porte (Sécurité incendie/panique)
  if (!doorIsOpen) {
    myServo.write(90);
    doorIsOpen = true;
    doorOpenTime = millis();
    updateDoorStatusFirestore(true);
  }
  
  // 2. Alarme visuelle et sonore intense
  for (int i = 0; i < 20; i++) {
    digitalWrite(LED_ROUGE, HIGH);
    tone(BUZZER, 3000, 100);
    delay(100);
    digitalWrite(LED_ROUGE, LOW);
    tone(BUZZER, 2000, 100);
    delay(100);
  }
}

void checkRemoteCommands() {
  static unsigned long last_command_check = 0;
  if (millis() - last_command_check < 2000) return; // poll every 2 seconds
  last_command_check = millis();
  
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = "https://" + String(FIREBASE_PROJECT_ID) + "-default-rtdb.firebaseio.com/commands/main_door.json?auth=" + firebaseIdToken;
  
  http.begin(url);
  int code = http.GET();
  if (code == 200) {
    String payload = http.getString();
    if (payload != "null" && payload.length() > 2) {
      StaticJsonDocument<256> doc;
      DeserializationError err = deserializeJson(doc, payload);
      if (!err) {
        String action = doc["action"] | "";
        unsigned long cmd_ts = doc["timestamp"] | 0; 
        
        static unsigned long last_processed_ts = 0;
        if (cmd_ts > last_processed_ts) {
          last_processed_ts = cmd_ts;
          Serial.println("Commande Web reçue : " + action);
          
          if (action == "OPEN") {
            openDoor();
          } else if (action == "CLOSE") {
            closeDoor();
          } else if (action == "EMERGENCY") {
            triggerEmergencyMode();
          }
        }
      }
    }
  }
  http.end();
}

void logAccessEventFirestore(String event, String uid = "") {
  StaticJsonDocument<256> doc;
  doc["event"] = event;
  if (uid.length() > 0) doc["uid"] = uid;
  doc["timestamp"] = millis();
  doc["datetime"] = getFormattedDateTime();
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  
  // Send in background (non-blocking)
  sendToFirestoreAsync("access_log", jsonStr);
}

bool verifyRFIDInBackend(String rfid_uid) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return false;
  }

  Serial.println(" ÉTAPE 1: Vérification du badge RFID [" + rfid_uid + "]...");
  HTTPClient http;
  String url = "http://" + String(BACKEND_IP) + ":5000/check-rfid?uid=" + rfid_uid;
  http.begin(url);
  http.setTimeout(5000);
  int code = http.GET();

  if (code == 200) {
    String response = http.getString();
    StaticJsonDocument<400> doc;
    DeserializationError err = deserializeJson(doc, response);
    if (err) {
      Serial.println(" Erreur JSON backend RFID");
      http.end();
      return false;
    }

    bool granted = doc["access_granted"] | false;
    String name = doc["name"] | "Utilisateur";
    http.end();

    if (granted) {
      Serial.println(" Badge valide pour: " + name);
      return true;
    } else {
      String reason = doc["reason"] | "carte_refusee";
      Serial.println(" Badge REFUSÉ. Raison: " + reason);
      sendDeniedAccessAlert(rfid_uid, reason);
      
      digitalWrite(LED_ROUGE, HIGH);
      tone(BUZZER, 2000, 300);
      delay(300);
      digitalWrite(LED_ROUGE, LOW);
      return false;
    }
  } else {
    Serial.println(" Serveur Backend injoignable (Code: " + String(code) + ")");
  }
  http.end();
  return false;
}

bool requestFaceVerification(String rfid_uid) {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    if (WiFi.status() != WL_CONNECTED) return false;
  }
  
  String url = "http://" + String(ESP32CAM_IP) + "/rfid-capture?uid=" + rfid_uid;
  HTTPClient http;
  http.setTimeout(60000);
  
  if (!http.begin(url)) {
    return false;
  }
  
  int httpCode = http.GET();
  if (httpCode != 200) {
    http.end();
    return false;
  }
  
  String payload = http.getString();
  http.end();
  
  if (payload.length() == 0) {
    return false;
  }
  
  StaticJsonDocument<300> doc;
  DeserializationError err = deserializeJson(doc, payload);
  
  if (err) {
    return false;
  }
  
  if (doc.containsKey("access_granted")) {
    bool granted = doc["access_granted"] | false;
    
    if (granted) {
      return true;
    } else {
      String reason = doc["reason"] | "visage_non_reconnu";
      sendDeniedAccessAlert(rfid_uid, reason);
      return false;
    }
  }
  return false;
}

// ---------- LOOP ----------
void loop() {

  // Auto-close door after 5 seconds
  if (doorIsOpen && (millis() - doorOpenTime > 5000)) {
    closeDoor();
  }
  
  // Check for Web Dashboard Commands
  checkRemoteCommands();

  // ========== PIR SENSOR ==========
  if (digitalRead(PIR_PIN) == HIGH) {
    compteur_mouvement++;
    delay(50);
  }

  // ========== VIBRATION SENSOR ==========
  if (digitalRead(VIB_PIN) == HIGH) {
    compteur_vibration++;
    Serial.println(" Vibration #" + String(compteur_vibration));
    delay(50);
  }

  // ========== CHECK THRESHOLDS EVERY 10 SECONDS ==========
  if (millis() - timer_fenetre > FENETRE_TEMPS_MS) {
    // Check door forcing
    if (compteur_vibration >= VIBRATION_SEUIL_FORCE) {
      sendForcingAttemptAlert(compteur_vibration);
    }
    
    // Check movement
    if (compteur_mouvement >= MOUVEMENT_SEUIL_INTRUSION) {
      sendIntrusionAlert(compteur_mouvement);
    } else if (compteur_mouvement >= MOUVEMENT_SEUIL_SUSPICION) {
      sendSuspiciousMovementAlert(compteur_mouvement);
    }
    
    // Silence routine logs unless there was activity
    if (compteur_mouvement > 0 || compteur_vibration > 0) {
       // Serial.println(" Compteurs réinitialisés");
    }
    
    // Reset counters
    compteur_mouvement = 0;
    compteur_vibration = 0;
    timer_fenetre = millis();
  }

  // ========== RFID ==========
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    String uidStr = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
      if (rfid.uid.uidByte[i] < 0x10) uidStr += "0";
      uidStr += String(rfid.uid.uidByte[i], HEX);
    }
    uidStr.toUpperCase();

    Serial.println(" RFID: " + uidStr);
    
    digitalWrite(LED_VERTE, HIGH);
    tone(BUZZER, 1000, 100);
    delay(100);
    digitalWrite(LED_VERTE, LOW);

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();

    if (verifyRFIDInBackend(uidStr)) {
      if (captureAndVerifyFace(uidStr)) { // Replaced with optimized combined function
        Serial.println(" ACCÈS AUTORISÉ!");
        
        digitalWrite(LED_VERTE, HIGH);
        
        // OPEN DOOR IMMEDIATELY
        openDoor();
        
        // Push actual log to RTDB so Dashboard Updates IN REAL TIME
        if (WiFi.status() == WL_CONNECTED) {
           HTTPClient logHttp;
           String logUrl = "https://" + String(FIREBASE_PROJECT_ID) + "-default-rtdb.firebaseio.com/access_logs.json?auth=" + firebaseIdToken;
           StaticJsonDocument<300> logDoc;
           logDoc["uid"] = uidStr;
           logDoc["status"] = "granted";
           logDoc["method"] = "facial_recognition";
           logDoc["timestamp"] = millis();
           logDoc["datetime"] = getFormattedDateTime();
           String logJson;
           serializeJson(logDoc, logJson);
           logHttp.begin(logUrl);
           logHttp.POST(logJson);
           logHttp.end();
        }
        
        // Log to Firestore as backup
        logAccessEventFirestore("access_granted", uidStr);
        
        delay(1500);
        digitalWrite(LED_VERTE, LOW);
      } else {
        Serial.println("ACCÈS REFUSÉ - Visage non reconnu");
        
        digitalWrite(LED_ROUGE, HIGH);
        for (int i = 0; i < 2; i++) {
          tone(BUZZER, 2200, 100);
          delay(150);
        }
        digitalWrite(LED_ROUGE, LOW);
      }
    }
  }

  delay(50);
}