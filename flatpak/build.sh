#!/bin/bash

# Build script for Flatpak on Manjaro Linux
# This script builds your Tauri app as a Flatpak package using optimized build process

set -e # Exit on error

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== TaskFlow Flatpak Builder with Optimized Build ===${NC}"

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

# Check if bun is installed
if ! command -v bun &>/dev/null; then
	echo -e "${RED}Error: bun is not installed${NC}"
	echo "Install it with: curl -fsSL https://bun.sh/install | bash"
	exit 1
fi

# Variables - CUSTOMIZE THESE
APP_ID="com.tcs.taskflow"
MANIFEST="com.tcs.taskflow.yml"
BUILD_DIR="./build"
REPO_DIR="./repo"

echo -e "${YELLOW}Step 1: Installing required runtimes...${NC}"
flatpak install -y --user flathub org.gnome.Platform//48 org.gnome.Sdk//48 || true

echo -e "${YELLOW}Step 2: Building Tauri app with optimized build process (no bundle)...${NC}"
# Use the optimized build script from package.json with --no-bundle to avoid linuxdeploy

cd ..
bun run tauri:build:fast
cd "$SCRIPT_DIR"

echo -e "${YELLOW}Step 3: Building Flatpak...${NC}"
flatpak-builder \
	--force-clean \
	--user \
	--install-deps-from=flathub \
	--repo="${REPO_DIR}" \
	"${BUILD_DIR}" \
	"${MANIFEST}"

echo -e "${GREEN}Step 4: Creating Flatpak bundle for installation...${NC}"
flatpak build-bundle "${REPO_DIR}" "${APP_ID}.flatpak" "${APP_ID}"

echo -e "${GREEN}Step 5: Installing Flatpak locally from bundle...${NC}"
flatpak install -y --user "./${APP_ID}.flatpak"

echo -e "${GREEN}=== Build Complete! ===${NC}"
echo ""
echo "To run your app:"
echo -e "  ${YELLOW}flatpak run ${APP_ID}${NC}"
echo ""
echo "To create a single-file bundle for distribution:"
echo -e "  ${YELLOW}flatpak build-bundle ${REPO_DIR} ${APP_ID}.flatpak ${APP_ID}${NC}"
echo ""
echo "To update the app:"
echo -e "  ${YELLOW}flatpak -y --user update ${APP_ID}${NC}"
echo ""
echo "To uninstall:"
echo -e "  ${YELLOW}flatpak uninstall --user ${APP_ID}${NC}"
