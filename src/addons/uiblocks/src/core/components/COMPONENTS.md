# UI Components

This directory contains the core building blocks for creating 3D user interfaces. The system distinguishes between **Physical World** containers (anchored in 3D space) and **UI World** containers (layout and styling).

## Containers

### UICard.ts

The **Physical World** bridge. It serves as the root container that connects your UI to the 3D scene.

- **Role**: Position, Rotation, Scaling, and Spatial Behaviors (Billboard, Head Leash).
- **Visuals**: Invisible by default (transparent). Acts as the "canvas" for your UI.
- **Children**: Holds `UIPanel`s and other components.

**Example Usage:**

```typescript
import {UICard, BillboardBehavior} from 'uiblocks';

const card = new UICard({
  name: 'MainMenu',
  position: new THREE.Vector3(0, 1.5, -2), // 2 meters in front
  sizeX: 0.5,
  sizeY: 0.3,
  anchorX: 'left',
  anchorY: 'bottom',
  behaviors: [new BillboardBehavior()], // Always face user
});
```

### UIPanel.ts

The **UI World** container. It handles visual styling, layout, and nesting.

- **Role**: Backgrounds, Borders, Shadows, Flexbox Layout (Row/Column).
- **Visuals**: High-fidelity rendering with gradients, rounded corners, and glassmorphism.
- **Children**: Holds other `UIPanel`s, `UIText`, `UIIcon`, etc.

**Example Usage:**

```typescript
import {UIPanel} from 'uiblocks';

const panel = new UIPanel({
  flexDirection: 'column',
  padding: 24,
  gap: 16,
  fillColor: '#1a1a1acc', // Semi-transparent dark bg
  cornerRadius: 32,
  strokeWidth: 2,
  strokeColor: '#ffffff33',
  strokeAlign: 'center', // 'inside', 'center', 'outside'
});
card.add(panel);
```

### Interaction

Implement the supported interactions callbacks when initializing the UIPanel: `onHoverEnter`, `onHoverExit`, and `onClick`.

```typescript
const interactivePanel = new UIPanel({
  fillColor: '#444',
  onHoverEnter: () => console.log('Hover Enter'),
  onHoverExit: () => console.log('Hover Exit'),
  onClick: () => console.log('Click'),
});
```

### Styling Examples

#### Gradients

UIPanel supports rich gradients (linear, radial, angular, diamond) for backgrounds and borders.

```typescript
const gradientPanel = new UIPanel({
  width: 100,
  height: 100,
  fillColor: {
    gradientType: 'linear',
    rotation: 45,
    stops: [
      {position: 0, color: '#ff0000'},
      {position: 0.5, color: '#00ff00'},
      {position: 1, color: '#0000ff'},
    ],
  },
});
```

#### Inner & Drop Shadows

You can add high-quality inner shadows (inset) and drop shadows (outer).

```typescript
const shadowPanel = new UIPanel({
  fillColor: '#333',

  // Inner Shadow
  innerShadowColor: '#ffffff88',
  innerShadowBlur: 15,
  innerShadowPosition: [0, 0],

  // Drop Shadow
  dropShadowColor: '#000000aa',
  dropShadowBlur: 30,
  dropShadowPosition: [10, -10],
});
```

#### Gradient Strokes

Strokes (borders) can also accept gradient definitions.

```typescript
const borderPanel = new UIPanel({
  fillColor: '#222',
  strokeWidth: 6,
  strokeColor: {
    gradientType: 'angular',
    rotation: 0,
    stops: [
      {position: 0, color: 'cyan'},
      {position: 1, color: 'purple'},
    ],
  },
});
```

#### Dynamic Properties

You can update properties dynamically using convenience methods or `setProperties()`.

```typescript
// 1. Common Setters
panel.setFillColor('#ff0000');
panel.setStrokeColor('#00ff00');
panel.setCornerRadius(20);
panel.setStrokeWidth(5);

// 2. Gradient Colors
panel.setFillColor({
  gradientType: 'linear',
  stops: [
    {position: 0, color: 'red'},
    {position: 1, color: 'blue'},
  ],
});

// 3. Generic setProperties (accepts any partial properties)
panel.setProperties({
  cornerRadius: 50,
  strokeWidth: 5,
  fillColor: '#333333',
});
```

## Content Components

### UIText.ts

Renders text content with full typographic control.

- **Features**: Font size, weight, color, alignment, overflow wrapping.
- **Usage**: Labels, titles, paragraphs.

**Example Usage:**

```typescript
import {UIText} from 'uiblocks';

const title = new UIText('Welcome to XR', {
  fontSize: 0.05, // meters
  color: '#ffffff',
  fontWeight: 'bold',
});
panel.add(title);
```

#### Dynamic Updates

Use convenience methods to update text properties efficiently.

```typescript
// Update text content
title.setText('New Title');

// Update style
title.setFontSize(12);
title.setColor('#ff4444');
title.setFontWeight('bold');
title.setOpacity(0.5);
```

### UIIcon.ts

Renders vector icons (typically Material Symbols).

- **Features**: Tinting, sizing, resolution-independent SVG rendering.
- **Usage**: Buttons, status indicators, navigation.

**Example Usage:**

```typescript
import {UIIcon} from 'uiblocks';

const settingsIcon = new UIIcon({
  icon: 'settings', // Material Symbol name
  color: '#44aaff',
  width: 40,
  height: 40,
});
panel.add(settingsIcon);
```

#### Dynamic Updates

```typescript
// Change icon
settingsIcon.setIcon('home');

// Animate weight (100-700)
settingsIcon.setIconWeight(700);

// Change style
settingsIcon.setIconStyle('rounded');

// Change fill
settingsIcon.setIconFill(1);

// Change color
settingsIcon.setColor('red');

// Change opacity
settingsIcon.setOpacity(0.5);
```

### UIImage.ts

Renders traditional raster images.

- **Features**: Sizing, aspect ratio preservation, rounded corners (via parent clipping or shader).
- **Usage**: Avatars, photos, album art.

**Example Usage:**

```typescript
import {UIImage} from 'uiblocks';

const avatar = new UIImage({
  src: 'assets/avatar.png',
  width: 40,
  height: 40,
  objectFit: 'cover',
});
// Or: new UIImage('assets/avatar.png', { ...props });
panel.add(avatar);
```

#### Dynamic Updates

```typescript
// Change image source
avatar.setSrc('assets/new-avatar.png');

// Update tint color
avatar.setColor('#00ff00'); // Tint green

// Animate opacity
avatar.setOpacity(0.5);

// Update border radius
avatar.setBorderRadius(20);
```

## Experimental Components

### AdditiveUICard.ts

> [!NOTE]
> This is an **experimental** experience.

The **AdditiveUICard** targets screen-space UI simulating optical see-through devices (e.g., smart glasses). It uses additive or screen blending to overlay content naturally on top of the physical camera feed or 3D background.

- **Role**: Emulate high-transparency displays with additive color blending.
- **Visuals**: Blends content together using `"screen"` or `"additive"` modes to preserve visibility inside optical lens projections.
- **Children**: Typically holds specialized layout adapters compatible with see-through transparency anchors.

**Example Usage:**

```typescript
import {AdditiveUICard} from 'uiblocks';

const additiveCard = new AdditiveUICard({
  name: 'SeethroughOverlay',
  sizeX: 1,
  sizeY: 1,
  blendMode: 'screen', // can be 'additive' or 'screen'
});
```
