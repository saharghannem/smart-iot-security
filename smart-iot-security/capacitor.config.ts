import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.smartiot',
  appName: 'Smart IoT Security',
  webDir: 'dist/smart-iot-security/browser'
  // To enable live-reload on a physical device, uncomment and specify your dev machine IP:
  // server: {
  //   url: 'http://YOUR_LOCAL_DEV_IP:4200',
  //   cleartext: true
  // }
};

export default config;
