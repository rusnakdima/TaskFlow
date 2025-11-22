#!/bin/bash

# Build script for Flatpak on Manjaro Linux
# This script builds your Tauri app as a Flatpak package using optimized build process
# Usage: ./build.sh [dev|prod]
#   dev: Fast build for development (default)
#   prod: Full build for production/store publication

set -e # Exit on error

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Parse command line argument
BUILD_TYPE="${1:-dev}" # Default to 'dev' if no argument provided

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ "$BUILD_TYPE" = "prod" ]; then
	echo -e "${GREEN}=== TaskFlow Flatpak Builder - Production Build ===${NC}"
	echo "Building for store publication with full validation..."
elif [ "$BUILD_TYPE" = "dev" ]; then
	echo -e "${GREEN}=== TaskFlow Flatpak Builder - Development Build ===${NC}"
	echo "Building with optimizations for fast iteration using pre-built binary..."
else
	echo -e "${RED}Error: Invalid build type '$BUILD_TYPE'${NC}"
	echo "Usage: $0 [dev|prod]"
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

# Check if required tools are installed (both dev and prod now use bun)
if [ "$BUILD_TYPE" = "dev" ]; then
	# For dev mode, we need bun to build the app first
	if ! command -v bun &>/dev/null; then
		echo -e "${RED}Error: bun is not installed for development build${NC}"
		echo "Install it with: curl -fsSL https://bun.sh/install | bash"
		exit 1
	fi
elif [ "$BUILD_TYPE" = "prod" ]; then
	# For prod mode, node/npm is needed for the initial environment (bun will be installed in the flatpak build)
	if ! command -v node &>/dev/null; then
		echo -e "${RED}Error: node is not installed for production build${NC}"
		echo "Install it with: sudo pacman -S nodejs"
		exit 1
	fi
fi

# Variables - CUSTOMIZE THESE
APP_ID="io.github.rusnakdima.TaskFlow"

# Select manifest based on build type
if [ "$BUILD_TYPE" = "dev" ]; then
	MANIFEST="${APP_ID}.local.yml"
else
	MANIFEST="${APP_ID}.yml"
fi

BUILD_DIR="./build"
REPO_DIR="./repo"

echo -e "${YELLOW}Step 1: Installing required runtimes...${NC}"
flatpak install -y --user flathub org.gnome.Platform//48 org.gnome.Sdk//48 || true

echo -e "${YELLOW}Step 2: Building Tauri app with optimized build process (no bundle)...${NC}"

if [ "$BUILD_TYPE" = "dev" ]; then
	# For development, build the app with bun first
	cd ..
	echo "Building Tauri app with bun..."
	bun run tauri:build:fast
	echo "App built. Proceeding with Flatpak packaging using local manifest..."
	cd "$SCRIPT_DIR"
fi

echo -e "${YELLOW}Step 3: Building Flatpak...${NC}"
flatpak-builder \
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
echo "To run your app:"
echo -e "  ${YELLOW}flatpak run ${APP_ID}${NC}"
echo ""
echo "To install the bundle:"
echo -e "  ${YELLOW}flatpak install ${APP_ID}.flatpak${NC}"
echo ""
echo "Created bundle: ${APP_ID}.flatpak"
echo ""
echo "Build type: ${BUILD_TYPE}"
echo "To uninstall:"
echo -e "  ${YELLOW}flatpak uninstall --user ${APP_ID}${NC}"
