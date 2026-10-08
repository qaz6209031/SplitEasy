// Extends app.json. EAS Build sets the update channel from eas.json; a local release build
// (`npx expo run:ios --configuration Release`) has no channel unless one is passed in, e.g.:
//   LOCAL_UPDATE_CHANNEL=production npx expo run:ios --configuration Release
module.exports = ({ config }) => {
  const channel = process.env.LOCAL_UPDATE_CHANNEL;
  if (!channel) return config;
  return {
    ...config,
    updates: { ...config.updates, requestHeaders: { 'expo-channel-name': channel } },
  };
};
