#!/bin/bash
set -e

# Script to synchronize version across all relevant files
# Usage: ./sync-versions.sh <new-version>

if [ $# -eq 0 ]; then
	echo "Usage: $0 <new-version>"
	echo "Example: $0 1.0.0"
	exit 1
fi

NEW_VERSION="$1"
CURRENT_DATE=$(date +%Y-%m-%d)

echo "Synchronizing version to: $NEW_VERSION"
echo "Release date: $CURRENT_DATE"

# Update package.json
if [ -f "package.json" ]; then
	sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" package.json
	echo "✓ Updated package.json"
fi

# Update Cargo.toml (app version only, not dependencies)
if [ -f "src-tauri/Cargo.toml" ]; then
	# Use a more specific pattern that matches the package version near the beginning of the file
	sed -i '0,/^version = "[^"]*"/s/version = "[^"]*"/version = "'"$NEW_VERSION"'"/' src-tauri/Cargo.toml
	echo "✓ Updated src-tauri/Cargo.toml"
fi

# Update tauri.conf.json
if [ -f "src-tauri/tauri.conf.json" ]; then
	sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json
	echo "✓ Updated src-tauri/tauri.conf.json"
fi

# Update environment.ts
if [ -f "src/environments/environment.ts" ]; then
	# Handle both single and double quotes for version
	sed -i "s/version: '[^']*'/version: '$NEW_VERSION'/" src/environments/environment.ts
	sed -i "s/version: \"[^\"]*\"/version: \"$NEW_VERSION\"/" src/environments/environment.ts
	echo "✓ Updated src/environments/environment.ts"
fi

# Update Flatpak manifest - taskflow
if [ -f "flatpak/com.tcs.taskflow.yml" ]; then
	sed -i "s/^version: .*/version: '$NEW_VERSION'/" flatpak/com.tcs.taskflow.yml
	echo "Updated flatpak/com.tcs.taskflow.yml"
fi

# Update Flatpak metainfo.xml with current date for taskflow
update_metainfo() {
	local metainfo_file="$1"

	if [ ! -f "$metainfo_file" ]; then
		return
	fi

	# Check if this version already exists
	if grep -q "version=\"$NEW_VERSION\"" "$metainfo_file"; then
		echo "⚠ Release version $NEW_VERSION already exists in $metainfo_file"
		return
	fi

	# Fallback method: simple text replacement (this is safer)
	cp "$metainfo_file" "${metainfo_file}.bak"

	# Insert the new release after <releases> tag
	awk -v version="$NEW_VERSION" -v date="$CURRENT_DATE" '
        /<releases>/ {
            print $0
            print "    <release version=\"" version "\" date=\"" date "\">"
            print "      <description>"
            print "        <p>Release version " version "</p>"
            print "      </description>"
            print "    </release>"
            next
        }
        { print }
        ' "${metainfo_file}.bak" >"$metainfo_file"

	rm -f "${metainfo_file}.bak"
	echo "✓ Updated $metainfo_file with new release"
}

# Update metainfo for taskflow
if [ -f "flatpak/com.tcs.taskflow.metainfo.xml" ]; then
	update_metainfo "flatpak/com.tcs.taskflow.metainfo.xml"
fi

echo ""
echo "================================================"
echo "✓ Version synchronization completed!"
echo "New version: $NEW_VERSION"
echo "Release date: $CURRENT_DATE"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Review the changes: git diff"
echo "2. Update release descriptions in metainfo.xml if needed"
echo "3. Commit: git add . && git commit -m 'Bump version to $NEW_VERSION'"
echo "4. Tag: git tag v$NEW_VERSION"
echo "5. Push: git push && git push --tags"