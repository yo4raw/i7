#!/bin/bash
# Start script for Render deployment

# Debug information
echo "Current directory: $(pwd)"
echo "Contents of current directory:"
ls -la

# Check if build directory exists
if [ -d "build" ]; then
    echo "Build directory found, starting application..."
    exec node build
elif [ -d "/opt/render/project/build" ]; then
    echo "Build directory found at /opt/render/project/build, starting application..."
    cd /opt/render/project
    exec node build
else
    echo "Error: Build directory not found!"
    echo "Looking for build in:"
    find . -name "build" -type d 2>/dev/null | head -10
    exit 1
fi