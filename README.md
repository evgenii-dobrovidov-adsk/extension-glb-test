# GLB Uploader Extension for Autodesk Forma

## Overview

![Screenshot](./screenshot.png)

A Proof of Concept extension for Autodesk Forma Site Design that enables uploading and placing GLB (GL Transmission Format Binary) 3D models into the scene.

This extension demonstrates how to build a custom tool for Autodesk Forma using the Forma Embedded View SDK. It allows users to:

- Select a `.glb` file from their local system
- Upload the file to Forma's element system
- Place the 3D model at the center of the terrain in the site design

## How It Works

The extension uses the **Forma Elements API** to interact with the element system:

1. **File Selection**: User selects a GLB file (max 200 MB)
2. **Upload**: The file is uploaded using the Elements API's blob management
3. **Placement**: The uploaded model is added to the scene as a Forma element with proper positioning
4. **Management**: Users can view the element path and delete placed models

## Key Technologies

- **Forma Embedded View SDK**: Provides the `ElementsApi` interface for element management
- **Elements System**: Forma's hierarchical element structure with URN-based identification
- **Blob Storage**: Handles 3D model file uploads and references

## Extension Architecture

Forma extensions follow these key principles:

- **Element Hierarchy**: Elements are organized in a tree structure with parent-child relationships
- **URN Identification**: Each element has a unique URN in the format `urn:adsk-forma-elements:...`
- **Representations**: Elements can have multiple visual representations (e.g., GLB models)
- **Transforms**: Elements have position, rotation, and scale in world coordinates

## Resources

- [Forma Elements API Documentation](https://app.autodeskforma.com/forma-embedded-view-sdk/docs/interfaces/elements.ElementsApi.html)
- [Element System Key Principles](https://aps.autodesk.com/en/docs/forma/v1/working-with-forma/element-system/key-principles/)

