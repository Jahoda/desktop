# Usage: script/gait-build-icon-assets.sh
# Recompiles the Gait icon (app/static/logos/gait/icon-logo.icon) into
# Assets.car and icon-logo-legacy.icns. Needs Xcode (actool).
set -e

cd "$( dirname "${BASH_SOURCE[0]}" )/../app/static/logos/gait"

OUTDIR=$(mktemp -d)
xcrun actool icon-logo.icon --compile "$OUTDIR" \
  --output-format human-readable-text --errors \
  --output-partial-info-plist "$OUTDIR/Info.plist" \
  --app-icon icon-logo --include-all-app-icons \
  --enable-on-demand-resources NO --development-region en \
  --target-device mac --minimum-deployment-target 26.0 --platform macosx

mv "$OUTDIR/Assets.car" ./Assets.car
mv "$OUTDIR/icon-logo.icns" ./icon-logo-legacy.icns
rm -rf "$OUTDIR"
