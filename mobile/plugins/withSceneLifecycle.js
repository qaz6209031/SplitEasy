// iOS 27 asserts at launch unless the app adopts the UIScene life cycle ("UIScene life cycle is
// required for apps built with this SDK"). Expo SDK 57 ships `ExpoAppSceneDelegate` for this, but the
// generated AppDelegate doesn't use it yet. This plugin wires it up during prebuild:
//   1. Info.plist declares a scene configuration whose delegate is `SceneDelegate`.
//   2. AppDelegate conforms to `ExpoReactNativeFactoryProvider` and no longer creates the window;
//      the scene delegate creates it and starts React Native into it.
//   3. `SceneDelegate` (a subclass of `ExpoAppSceneDelegate`) is appended to AppDelegate.swift.
// Remove this plugin once Expo's template adopts scenes itself.

const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const MARKER = '// [withSceneLifecycle]';

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle only supports a Swift AppDelegate.');
    }
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    const classDecl = 'class AppDelegate: ExpoAppDelegate {';
    if (!src.includes(classDecl)) throw new Error('withSceneLifecycle: unexpected AppDelegate declaration.');
    src = src.replace(classDecl, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');

    // The scene delegate creates the window and starts React Native; the app delegate only builds the factory.
    const startBlock = /#if os\(iOS\) \|\| os\(tvOS\)\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*factory\.startReactNative\([\s\S]*?\)\s*#endif\s*/;
    if (!startBlock.test(src)) throw new Error('withSceneLifecycle: could not find the window/startReactNative block.');
    src = src.replace(startBlock, `${MARKER} React Native starts in SceneDelegate (UIScene life cycle).\n\n    `);

    src += `
${MARKER}
// UIScene life cycle (required by the iOS 27 SDK): ExpoAppSceneDelegate creates the window from the
// connecting scene, starts React Native into it, and forwards URL / user-activity events.
class SceneDelegate: ExpoAppSceneDelegate {}
`;
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};
