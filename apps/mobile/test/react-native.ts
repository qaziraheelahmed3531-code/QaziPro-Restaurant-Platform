// Minimal Vitest-only native surface. Production builds resolve the real
// react-native package; API unit tests only need the client platform value.
export const Platform = { OS: "android" as const };
