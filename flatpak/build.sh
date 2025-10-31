#!/bin/bash
set -e

MANIFEST_FILE="com.tcs.taskflow.yml"
BUILD_DIR="build-dir"
REPO_DIR="repo"

echo "Building Flatpak for TaskFlow..."

# Function to detect package manager
detect_package_manager() {
  if command -v pacman &> /dev/null; then
    echo "pacman"
  elif command -v apt &> /dev/null; then
    echo "apt"
  elif command -v dnf &> /dev/null; then
    echo "dnf"
  elif command -v yum &> /dev/null; then
    echo "yum"
  else
    echo "unknown"
  fi
}

# Function to install flatpak-builder
install_flatpak_builder() {
  local pm="$1"
  echo "Installing flatpak-builder using $pm..."
  case "$pm" in
    pacman)
      sudo pacman -S --needed --noconfirm flatpak-builder
      ;;
    apt)
      sudo apt update && sudo apt install -y flatpak-builder
      ;;
    dnf)
      sudo dnf install -y flatpak-builder
      ;;
    yum)
      sudo yum install -y flatpak-builder
      ;;
    *)
      echo "Unsupported package manager. Please install flatpak-builder manually."
      exit 1
      ;;
  esac
}

# Ensure flatpak-builder is installed
if ! command -v flatpak-builder &> /dev/null; then
  echo "flatpak-builder not found. Attempting to install..."
  PM=$(detect_package_manager)
  install_flatpak_builder "$PM"
fi

# Add flathub remote if not exists
echo "Ensuring Flathub remote is configured..."
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo || true

# Ensure required Flatpak runtimes and SDK extensions are installed
echo "Installing required Flatpak runtimes and SDK extensions..."

# Install runtime and SDK for GNOME 46
echo "Installing GNOME Platform and SDK version 46..."
flatpak install --user --noninteractive flathub org.gnome.Platform//46 2>/dev/null || echo "✓ Platform already installed"
flatpak install --user --noninteractive flathub org.gnome.Sdk//46 2>/dev/null || echo "✓ SDK already installed"

# Install SDK extensions for freedesktop 24.08
echo "Installing Node.js 22 and Rust SDK extensions..."
flatpak install --user --noninteractive flathub org.freedesktop.Sdk.Extension.node22//24.08 2>/dev/null || echo "✓ Node22 extension already installed"
flatpak install --user --noninteractive flathub org.freedesktop.Sdk.Extension.rust-stable//24.08 2>/dev/null || echo "✓ Rust extension already installed"

# Clean previous build
echo "Cleaning previous builds..."
rm -rf $BUILD_DIR $REPO_DIR

# Build the flatpak
echo ""
echo "Building Flatpak package (this may take a while)..."
flatpak-builder --force-clean --repo=$REPO_DIR --install-deps-from=flathub --user $BUILD_DIR $MANIFEST_FILE

# Create a single-file bundle
echo ""
echo "Creating Flatpak bundle..."
flatpak build-bundle $REPO_DIR taskflow.flatpak com.tcs.taskflow

echo ""
echo "✅ Build completed successfully!"
echo ""
echo "Generated file: taskflow.flatpak"
echo ""
echo "To install the Flatpak, run:"
echo "  flatpak install --user taskflow.flatpak"
echo ""
echo "To run the app:"
echo "  flatpak run com.tcs.taskflow"