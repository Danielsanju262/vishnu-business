import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vishnu.business',
  appName: 'Vishnu Business',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      // Android-specific settings
      smallIcon: 'ic_notification',
      iconColor: '#4F46E5',
      sound: 'default',
      // iOS-specific settings  
      importance: 4, // HIGH importance
      visibility: 1, // PUBLIC visibility
    }
  }
};

export default config;
