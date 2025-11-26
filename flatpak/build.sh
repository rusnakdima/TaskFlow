#!/bin/bash

# Build script for Flatpak Linux
# This script builds your Tauri app as a Flatpak package
# Usage: ./build.sh [build|no-build]
#   build: Build the Tauri app first then create Flatpak (default)
#   no-build: Skip building the Tauri app and proceed with Flatpak packaging using existing binary

set -e # Exit on error

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Parse command line argument
BUILD_TAURI="${1:-build}" # Default to 'build' if no argument provided

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ "$BUILD_TAURI" != "build" ] && [ "$BUILD_TAURI" != "no-build" ]; then
	echo -e "${RED}Error: Invalid build option '$BUILD_TAURI'${NC}"
	echo "Usage: $0 [build|no-build]"
	exit 1
fi

# Check if flatpak and flatpak-builder are installed
if ! command -v flatpak &>/dev/null; then
	echo -e "${RED}Error: flatpak is not installed${NC}"
	echo "Install it with: sudo pacman -S flatpak"
	exit 1
fi

if ! command -v flatpak-builder &>/dev/null; then
	echo -e "${RED}Error: flatpak-builder is not installed${NC}"
	echo "Install it with: sudo pacman -S flatpak-builder"
	exit 1
fi

# Check if bun is installed (required when building Tauri app)
if [ "$BUILD_TAURI" = "build" ]; then
	if ! command -v bun &>/dev/null; then
		echo -e "${RED}Error: bun is not installed for Tauri build${NC}"
		echo "Install it with: curl -fsSL https://bun.sh/install | bash"
		exit 1
	fi
fi

# Variables - CUSTOMIZE THESE
APP_ID="com.tcs.taskflow"
MANIFEST="${APP_ID}.yml"
BUILD_DIR="./build"
REPO_DIR="./repo"

echo -e "${YELLOW}Step 1: Installing required runtimes...${NC}"
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo || true
flatpak install -y --user flathub org.gnome.Platform//48 org.gnome.Sdk//48 || true

echo -e "${YELLOW}Step 2: Building Tauri app with optimized build process (no bundle)...${NC}"

if [ "$BUILD_TAURI" = "build" ]; then
	# Build the app with bun first
	cd ..
	echo "Building Tauri app with bun..."
	bun run tauri:build:fast
	echo "App built. Proceeding with Flatpak packaging..."
	cd "$SCRIPT_DIR"
elif [ "$BUILD_TAURI" = "no-build" ]; then
	echo -e "${YELLOW}Skipping Tauri app build step as requested. Using existing binary.${NC}"
fi

echo -e "${YELLOW}Step 3: Building Flatpak...${NC}"
flatpak-builder \
	--disable-cache \
	--force-clean \
	--user \
	--install-deps-from=flathub \
	--repo="${REPO_DIR}" \
	"${BUILD_DIR}" \
	"${MANIFEST}"

echo -e "${YELLOW}Step 4: Creating Flatpak bundle...${NC}"
flatpak build-bundle "${REPO_DIR}" "${APP_ID}.flatpak" "${APP_ID}"
echo -e "${GREEN}=== Build Complete! ===${NC}"
echo ""
echo "Created bundle: ${APP_ID}.flatpak"
echo ""
echo "To install the bundle:"
echo -e "  ${YELLOW}flatpak install ${APP_ID}.flatpak${NC}"
echo ""
echo "To run your app:"
echo -e "  ${YELLOW}flatpak run ${APP_ID}${NC}"
echo ""
echo "To uninstall:"
echo -e "  ${YELLOW}flatpak uninstall --user ${APP_ID}${NC}"
