/**
 * Gmail / Facebook sign-in need each provider's own phone SDK. They are loaded only when the app was built
 * with them, so the app keeps working (and says so politely) in a build that does not have them yet.
 *
 * Build steps (once): `npm i @react-native-google-signin/google-signin react-native-fbsdk-next`, then follow
 * each library's Android setup. The client ids themselves come from the admin panel (Login & Payments).
 */
type Opt = { default?: unknown } & Record<string, unknown>;

// Metro bundles only `require` calls whose module name is a plain string, so each provider gets its own
// try/catch (Metro treats a require inside try/catch as optional: a build without the library still bundles).
function loadGoogle(): Opt | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-google-signin/google-signin') as Opt;
  } catch {
    return null;
  }
}

function loadFacebook(): Opt | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-fbsdk-next') as Opt;
  } catch {
    return null;
  }
}

export const NOT_IN_BUILD = 'This sign-in method is coming soon. Please continue with your phone number for now.';

export async function googleAccessToken(webClientId: string): Promise<string> {
  const lib = loadGoogle() as {
    GoogleSignin?: {
      configure: (c: { webClientId: string; scopes?: string[] }) => void;
      hasPlayServices: () => Promise<boolean>;
      signIn: () => Promise<unknown>;
      getTokens: () => Promise<{ accessToken: string }>;
    };
  } | null;
  if (!lib?.GoogleSignin) throw new Error(NOT_IN_BUILD);
  lib.GoogleSignin.configure({ webClientId, scopes: ['email', 'profile'] });
  await lib.GoogleSignin.hasPlayServices();
  await lib.GoogleSignin.signIn();
  return (await lib.GoogleSignin.getTokens()).accessToken;
}

export async function facebookAccessToken(): Promise<string> {
  const lib = loadFacebook() as {
    LoginManager?: { logInWithPermissions: (p: string[]) => Promise<{ isCancelled: boolean }> };
    AccessToken?: { getCurrentAccessToken: () => Promise<{ accessToken: string } | null> };
  } | null;
  if (!lib?.LoginManager || !lib.AccessToken) throw new Error(NOT_IN_BUILD);
  const result = await lib.LoginManager.logInWithPermissions(['public_profile', 'email']);
  if (result.isCancelled) throw new Error('Facebook sign-in was closed.');
  const token = await lib.AccessToken.getCurrentAccessToken();
  if (!token) throw new Error('Facebook sign-in did not finish.');
  return token.accessToken;
}
