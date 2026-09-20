# Mobile internal-store readiness

This is a preparation checklist, not authorization to publish.

## Google Play internal testing

- [x] Configurable Android package ID and version code.
- [x] AAB production profile and APK internal profile defined.
- [x] Adaptive icon and splash configuration present.
- [x] Only location and notification permissions are intentionally requested.
- [ ] Expo/EAS account linked to this repository.
- [ ] Google Play app created for the approved package ID.
- [ ] Play App Signing or approved organization keystore configured securely.
- [ ] Signed AAB generated and uploaded to Internal testing.
- [ ] Tester list/group configured and install verified.
- [ ] App name, short/full description, category, contact email and screenshots supplied.
- [ ] Feature graphic and any required localized assets supplied.
- [ ] Privacy policy URL and terms/support URLs supplied; none are invented in source.
- [ ] Data Safety answers reviewed for account/profile, address/location, order, device token and diagnostics data.
- [ ] Content rating, ads declaration, target audience, app access/reviewer account and country availability completed.
- [ ] FCM delivery and App Link verified with the signing certificate SHA-256.

## Apple TestFlight / App Store

- [x] Configurable bundle ID, version and build number.
- [x] Icon, splash, URL scheme, location description and associated domain configuration present.
- [x] iOS Simulator EAS profile prepared.
- [ ] Apple Developer organization/team and App Store Connect access supplied.
- [ ] Bundle ID/App ID and APNs capability registered.
- [ ] Distribution certificate and provisioning profile configured securely.
- [ ] Signed build generated on EAS or macOS/Xcode and processed by App Store Connect.
- [ ] Internal TestFlight group configured and install verified.
- [ ] App name, subtitle, description, keywords, category, support and marketing details supplied.
- [ ] Required iPhone/iPad screenshots supplied because tablet support is enabled.
- [ ] Privacy policy URL and support/terms URLs supplied; none are invented in source.
- [ ] App Privacy answers reviewed for account/profile, address/location, order, device token and diagnostics data.
- [ ] Age rating, export compliance, review notes and reviewer account completed.
- [ ] APNs receipt/tap and Universal Link verified on an eligible device.

## Shared release evidence

- [ ] Real user login, refresh, logout and password-reset callback tested.
- [ ] Full staging COD checkout and idempotent retry tested on device.
- [ ] Order history, tracking, cancellation and reorder tested.
- [ ] Location denial/manual fallback and notification denial tested.
- [ ] TalkBack/VoiceOver, text scaling, keyboard, safe area, slow/offline network and cold-start checks recorded.
- [ ] Final source and artifacts pass secret/local-URL scans.
- [ ] Production Supabase and live `qazipro.com` remain untouched until a separate approved release step.
