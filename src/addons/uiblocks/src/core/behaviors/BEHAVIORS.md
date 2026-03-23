# UI Behaviors

This directory contains executable behaviors (mixins/scripts) that add spatial interactions and positioning logic to **UICard** components. These behaviors are specifically designed to work with the `UICard` system to make cards responsive to the user's head position, controller input, or other objects in the scene.

## Available Behaviors

### BillboardBehavior.ts

Makes a `UICard` automatically face the user's camera (Head).

- **Usage**: Attach to cards that should always be legible regardless of user viewing angle.
- **Constructor Config** (`BillboardConfig`):
  - `mode`: 'cylindrical' | 'spherical' (default: 'cylindrical') - Restrict rotation to the Y-axis (cylindrical) or allow full 3D rotation (spherical).
  - `lerpFactor`: number (default: 0.1) - Smoothing value. Higher values mean faster rotation (1.0 = instant).

### HeadLeashBehavior.ts

Makes a `UICard` gently follow the user's head movement with a delay (spring/damper), keeping it within a comfortable viewing frustum.

- **Usage**: Great for "Heads-Up Display" (HUD) style cards or floating assistants.
- **Constructor Config** (`HeadLeashConfig`):
  - `offset`: THREE.Vector3 - Position offset relative to the camera.
  - `posLerp`: number (default: 0.1) - Smoothing factor for position.
  - `rotLerp`: number (default: 0.1) - Smoothing factor for rotation.

### ObjectAnchorBehavior.ts

Anchors a `UICard` to another 3D object in the scene, with optional offsets.

- **Usage**: Labels, health bars, or context menus attached to 3D models.
- **Constructor Config** (`ObjectAnchorConfig`):
  - `target`: AnchorTarget (has `position` and optional `quaternion`).
  - `mode`: 'position' | 'rotation' | 'pose' (default: 'position') - Which transform components to sync.
  - `positionOffset`: THREE.Vector3 (optional)
  - `rotationOffset`: THREE.Quaternion (optional)

### ToggleAnimationBehavior.ts

Handles smooth show/hide transitions for a `UICard` when its visibility changes.

- **Usage**: Smoothly fading or scaling menus in and out.
- **Constructor Config** (`ToggleAnimationConfig`):
  - `showAnimation`: 'scale' (default: 'scale')
  - `hideAnimation`: 'scale' (default: 'scale')
  - `duration`: number (default: 0.3) - Duration in seconds.

### ManipulationBehavior.ts

Handles visual padding expansion, rounded edges, and interactive cursor glows for a `UICard` when responding to laser pointer hovers. Also provides complete 3DOF Drag-and-Drop functionality using the user's controllers.

- **Usage**: Automatically injected into interactable components, or manually added to enable 3D dragging.
- **Constructor Config** (`ManipulationConfig`):
  - `draggable`: boolean (default: undefined) - If true, activates layout expansion offsets and allows the user to cleanly grab and move the panel in 3D space with a controller.
  - `faceCamera`: boolean (default: undefined) - If true, seamlessly rotates the panel to automatically face the user the moment they grab it, retaining that rotation upon drop.

> [!NOTE]
> **Global Dragging State**
> Whenever a card is actively being dragged via `ManipulationBehavior`, it sets the `this.card.isDragging` property to `true`.
> Behaviors like `BillboardBehavior`, `HeadLeashBehavior`, and `ObjectAnchorBehavior` will automatically detect this state and gracefully pause their own transform updates. Once the user drops the card, they dynamically recalculate their offsets to securely adapt to the panel's new dropped location!

## How to Use

These behaviors are typically applied to `UICard` instances using the `addBehavior` method.

```typescript
// Option 1: Configuring directly in the UICard's properties array setup
const myCard = new UICard({
  behaviors: [new BillboardBehavior({mode: 'cylindrical'})],
});

// Option 2: Dynamically appending to an existing card using the addBehavior method
myCard.addBehavior(new BillboardBehavior({mode: 'spherical'}));
```
