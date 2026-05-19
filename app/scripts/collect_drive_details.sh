#!/bin/bash

# Configuration Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${MYCLOUD_ENV_FILE:-$APP_DIR/app/data/mycloud.env}"
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

MOUNT_POINT="${MYCLOUD_STORAGE_ROOT:-/mnt/Drive1}"
DEVICE="${MYCLOUD_STORAGE_DEVICE:-/dev/sda1}"
OUTPUT_LOG="${MYCLOUD_DRIVE_REPORT:-$APP_DIR/app/data/drive_report.txt}"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

# Ensure data directory exists
mkdir -p "$(dirname "$OUTPUT_LOG")"

{
    echo "========================================================="
    echo "            EXTERNAL STORAGE ANALYSIS REPORT             "
    echo "            Generated on: $TIMESTAMP                     "
    echo "========================================================="
    echo ""

    # 1. CHECK MOUNT STATUS
    echo "--- [1. Mount & Filesystem Information] ---"
    if mountpoint -q "$MOUNT_POINT"; then
        echo "Status: MOUNTED"
        mount | grep "$MOUNT_POINT"
    else
        echo "Status: ERROR - Drive is NOT mounted at $MOUNT_POINT!"
        exit 1
    fi
    echo ""

    # 2. DISK SPACE CONSUMPTION
    echo "--- [2. Disk Space Allocation] ---"
    df -h "$MOUNT_POINT"
    echo ""

    # 3. UNDERLYING HARDWARE PARAMETERS
    echo "--- [3. Hardware Block Device Attributes] ---"
    lsblk -o NAME,FSTYPE,SIZE,LABEL,UUID,MODEL "$DEVICE" 2>/dev/null || lsblk -o NAME,FSTYPE,SIZE,LABEL,UUID "$DEVICE"
    echo ""

    # 4. ACTIVE WRITE HEALTH CHECK
    echo "--- [4. Read/Write Health Status] ---"
    TEST_FILE="$MOUNT_POINT/.health_test_file"
    if touch "$TEST_FILE" 2>/dev/null; then
        echo "Write Capability: HEALTHY (Read/Write Active)"
        rm "$TEST_FILE"
    else
        echo "Write Capability: CRITICAL CRASH RISK (Drive has dropped to READ-ONLY mode!)"
    fi
    echo ""

    # 5. STORAGE ARCHIVE QUANTITY
    echo "--- [5. File & Directory Inventory Count] ---"
    echo "Counting directories and files (this may take a few seconds)..."
    total_dirs=$(find "$MOUNT_POINT" -type d 2>/dev/null | wc -l)
    total_files=$(find "$MOUNT_POINT" -type f 2>/dev/null | wc -l)
    echo "Total Folders: $total_dirs"
    echo "Total Files:   $total_files"
    echo ""

    # 6. TOP LEVEL SIZE BREAKDOWN
    echo "--- [6. Top-Level Folder Space Breakdown] ---"
    # Lists sizes of all immediate folders/files, hiding errors from corrupted directories
    du -sh "$MOUNT_POINT"/* 2>/dev/null | sort -hr
    echo ""
    
    echo "========================================================="
    echo "                 END OF DRIVE REPORT                     "
    echo "========================================================="

} > "$OUTPUT_LOG" 2>&1

# Output quick success indicator to terminal
echo "Drive analysis complete. Metrics written to: $OUTPUT_LOG"
