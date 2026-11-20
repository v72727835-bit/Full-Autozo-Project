/**
 * @format
 */

import React from 'react';
import { AppRegistry, View } from 'react-native';
import { name as appName } from './app.json';
import { bootstrapTheme } from './src/theme/remoteTheme';

/**
 * The super admin's colours must be in place before any screen is imported, because styles are
 * compiled when a module first loads. So `App` is required only after the theme has been applied
 * (fresh from the server if it answers within 1.5 s, otherwise the one remembered from last time).
 */
function Root() {
  const [App, setApp] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    bootstrapTheme()
      .catch(() => undefined)
      .then(() => {
        if (alive) setApp(() => require('./App').default);
      });
    return () => {
      alive = false;
    };
  }, []);
  return App ? React.createElement(App) : React.createElement(View, { style: { flex: 1, backgroundColor: '#ffffff' } });
}

AppRegistry.registerComponent(appName, () => Root);
