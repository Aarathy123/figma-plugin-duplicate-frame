(async () => {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });

  function nearestFrame(node: SceneNode | null): FrameNode | null {
    let cur: BaseNode | null = node;
    while (cur) {
      if (cur.type === "FRAME") return cur as FrameNode;
      cur = cur.parent;
    }
    return null;
  }

  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    figma.notify("Select one or more Frames to duplicate below.");
    figma.closePlugin();
    return;
  }

  const frames = selection
    .map((n) => nearestFrame(n))
    .filter((f): f is FrameNode => f !== null);

  if (frames.length === 0) {
    figma.notify("No Frames found in selection.");
    figma.closePlugin();
    return;
  }

  // Track where to place next comments section
  let nextAvailableY = Math.max(...frames.map((f) => f.y + f.height)) + 200;
  const verticalGap = 200;

  // Store all link relationships for navigation
  const globalCommentLinks: Record<string, string> = {};

  for (const frame of frames) {
    const parent = frame.parent as BaseNode & ChildrenMixin;
    if (!parent) continue;

    // ✅ Duplicate frame below the original
    const dup = frame.clone();
    dup.name = `${frame.name} Copy`;

    dup.x = frame.x;
    dup.y = frame.y + frame.height + 100;
    parent.appendChild(dup);

    const children = dup.children;
    const commentTargets = [1, 3];
    const commentData: { id: string; title: string; text: string }[] = [];

    // 🎈 Create comment bubbles
    for (const idx of commentTargets) {
      if (children[idx]) {
        const target = children[idx];

        const bubble = figma.createFrame();
        bubble.resize(120, 46);
        bubble.cornerRadius = 20;
        bubble.fills = [{ type: "SOLID", color: { r: 1, g: 0.95, b: 0.8 } }];
        bubble.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.8, b: 0.4 } }];
        bubble.name = `💬 Comment on ${target.name || `Node ${idx + 1}`}`;
        bubble.layoutMode = "HORIZONTAL";
        bubble.primaryAxisSizingMode = "AUTO";
        bubble.counterAxisSizingMode = "AUTO";
        bubble.paddingLeft = 12;
        bubble.paddingRight = 12;
        bubble.paddingTop = 8;
        bubble.paddingBottom = 8;

        const text = figma.createText();
        text.characters = `💬 Note on ${target.name || `Node ${idx + 1}`}`;
        text.fontSize = 12;
        bubble.appendChild(text);

        // Place bubble top-right
        const offsetX = 8;
        const offsetY = -8;
        bubble.x = target.x + target.width - bubble.width / 2 - offsetX;
        bubble.y = target.y - bubble.height - offsetY;

        dup.appendChild(bubble);

        const commentText = `This is a note for ${
          target.name || `Node ${idx + 1}`
        }`;
        commentData.push({
          id: bubble.id,
          title: bubble.name,
          text: commentText,
        });
      }
    }

    // 🗨️ Create Comments Section for this duplicate
    const commentsFrame = figma.createFrame();
    commentsFrame.name = `🗨️ Comments Section (${dup.name})`;
    commentsFrame.layoutMode = "VERTICAL";
    commentsFrame.primaryAxisSizingMode = "AUTO";
    commentsFrame.counterAxisSizingMode = "AUTO";
    commentsFrame.paddingLeft = 16;
    commentsFrame.paddingRight = 16;
    commentsFrame.paddingTop = 16;
    commentsFrame.paddingBottom = 16;
    commentsFrame.itemSpacing = 8;
    commentsFrame.fills = [
      { type: "SOLID", color: { r: 0.97, g: 0.97, b: 0.97 } },
    ];
    commentsFrame.strokes = [
      { type: "SOLID", color: { r: 0.8, g: 0.8, b: 0.8 } },
    ];
    commentsFrame.strokeWeight = 1;
    commentsFrame.cornerRadius = 12;

    const title = figma.createText();
    title.characters = `💬 Comments for ${dup.name}`;
    title.fontSize = 16;
    commentsFrame.appendChild(title);

    for (const comment of commentData) {
      const card = figma.createFrame();
      card.name = comment.title;
      card.layoutMode = "VERTICAL";
      card.primaryAxisSizingMode = "AUTO";
      card.counterAxisSizingMode = "AUTO";
      card.paddingLeft = 10;
      card.paddingRight = 10;
      card.paddingTop = 6;
      card.paddingBottom = 6;
      card.itemSpacing = 2;
      card.cornerRadius = 8;
      card.fills = [{ type: "SOLID", color: { r: 1, g: 0.97, b: 0.85 } }];
      card.strokes = [{ type: "SOLID", color: { r: 0.85, g: 0.8, b: 0.45 } }];

      const nameText = figma.createText();
      nameText.characters = comment.title;
      nameText.fontSize = 13;

      const descText = figma.createText();
      descText.characters = comment.text;
      descText.fontSize = 11;

      card.appendChild(nameText);
      card.appendChild(descText);

      // Link card → bubble
      card.setPluginData("targetBubbleId", comment.id);
      globalCommentLinks[comment.id] = dup.id;

      commentsFrame.appendChild(card);
    }

    // 🧭 Position commentsFrame below everything (no overlap)
    commentsFrame.x = dup.x + dup.width + 100;
    commentsFrame.y = nextAvailableY;

    parent.appendChild(commentsFrame);

    // Update next Y offset so next section is placed below
    nextAvailableY += commentsFrame.height + verticalGap;
  }

  // 🎯 Click-to-focus logic with glow
  figma.on("selectionchange", () => {
    const selected = figma.currentPage.selection[0];
    if (!selected) return;

    const targetBubbleId = selected.getPluginData("targetBubbleId");
    if (targetBubbleId) {
      const targetBubble = figma.getNodeById(targetBubbleId);

      if (
        targetBubble &&
        "effects" in targetBubble &&
        Array.isArray(targetBubble.effects)
      ) {
        const bubble = targetBubble as
          | FrameNode
          | RectangleNode
          | ComponentNode;
        figma.viewport.scrollAndZoomIntoView([bubble]);
        figma.currentPage.selection = [bubble];

        const glow: Effect = {
          type: "DROP_SHADOW",
          color: { r: 1, g: 0.9, b: 0, a: 0.8 },
          offset: { x: 0, y: 0 },
          radius: 16,
          visible: true,
          blendMode: "NORMAL",
        };

        const originalEffects = bubble.effects.slice();
        bubble.effects = [...originalEffects, glow];

        figma.notify(`Focused on ${bubble.name}`);

        setTimeout(() => {
          bubble.effects = originalEffects;
        }, 1200);
      }
    }
  });

  figma.notify(
    "✅ Duplicated below + Comments added. Click a comment to focus its bubble!"
  );
})();
