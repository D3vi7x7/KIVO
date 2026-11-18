import { describe, expect, it } from "vitest";

describe("Boards & Infinite Canvas Logic", () => {
  it("translates screen coordinates to canvas space under pan and zoom", () => {
    function screenToCanvas(
      screenX: number,
      screenY: number,
      rectLeft: number,
      rectTop: number,
      panX: number,
      panY: number,
      zoom: number,
    ) {
      const x = (screenX - rectLeft - panX) / zoom;
      const y = (screenY - rectTop - panY) / zoom;
      return { x, y };
    }

    // Centered screen at 100% zoom with zero pan
    const pos1 = screenToCanvas(500, 300, 0, 0, 0, 0, 1.0);
    expect(pos1.x).toBe(500);
    expect(pos1.y).toBe(300);

    // Zoomed at 200% with pan (100, 50)
    const pos2 = screenToCanvas(500, 300, 0, 0, 100, 50, 2.0);
    expect(pos2.x).toBe(200); // (500 - 100) / 2
    expect(pos2.y).toBe(125); // (300 - 50) / 2
  });

  it("extracts YouTube video embed IDs accurately", () => {
    function getYoutubeEmbed(url: string) {
      const match = url.match(
        /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/,
      );
      return match ? `https://www.youtube.com/embed/${match[1]}` : url;
    }

    expect(getYoutubeEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    expect(getYoutubeEmbed("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    expect(getYoutubeEmbed("https://kivo.app/video.mp4")).toBe(
      "https://kivo.app/video.mp4",
    );
  });

  it("computes element z-index layering correctly", () => {
    const elements = [
      { id: "e1", z_index: 1 },
      { id: "e2", z_index: 2 },
      { id: "e3", z_index: 3 },
    ];

    const maxZ = Math.max(...elements.map((e) => e.z_index), 0);
    expect(maxZ + 1).toBe(4);
  });

  it("calculates dynamic node connector endpoints between two elements", () => {
    function getConnectorEndpoints(
      from: { x: number; y: number; width: number; height: number },
      to: { x: number; y: number; width: number; height: number },
    ) {
      const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
      const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;

      let start = { ...fromCenter };
      let end = { ...toCenter };

      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal connection dominant
        start.x = dx > 0 ? from.x + from.width : from.x;
        end.x = dx > 0 ? to.x : to.x + to.width;
      } else {
        // Vertical connection dominant
        start.y = dy > 0 ? from.y + from.height : from.y;
        end.y = dy > 0 ? to.y : to.y + to.height;
      }
      return { start, end };
    }

    const cardA = { x: 100, y: 100, width: 200, height: 100 };
    const cardB = { x: 500, y: 100, width: 200, height: 100 };

    const { start, end } = getConnectorEndpoints(cardA, cardB);

    // card A is to the left of card B -> start on right edge of A (x=300), end on left edge of B (x=500)
    expect(start.x).toBe(300);
    expect(end.x).toBe(500);
  });

  it("identifies elements contained inside a Figma-style Section", () => {
    function isElementInsideSection(
      elem: { x: number; y: number; width: number; height: number },
      section: { x: number; y: number; width: number; height: number },
    ) {
      const elemCenterX = elem.x + elem.width / 2;
      const elemCenterY = elem.y + elem.height / 2;
      return (
        elemCenterX >= section.x &&
        elemCenterX <= section.x + section.width &&
        elemCenterY >= section.y &&
        elemCenterY <= section.y + section.height
      );
    }

    const section = { x: 100, y: 100, width: 600, height: 500 };
    const insideNote = { x: 150, y: 150, width: 200, height: 200 };
    const outsideNote = { x: 800, y: 150, width: 200, height: 200 };

    expect(isElementInsideSection(insideNote, section)).toBe(true);
    expect(isElementInsideSection(outsideNote, section)).toBe(false);
  });

  it("validates 3D models to GLB or GLTF format only", () => {
    function isValid3DFormat(filename: string): boolean {
      const clean = filename.toLowerCase().split("?")[0];
      return clean.endsWith(".glb") || clean.endsWith(".gltf");
    }

    expect(isValid3DFormat("model.glb")).toBe(true);
    expect(isValid3DFormat("scene.gltf?token=123")).toBe(true);
    expect(isValid3DFormat("asset.obj")).toBe(false);
    expect(isValid3DFormat("image.png")).toBe(false);
    expect(isValid3DFormat("model.fbx")).toBe(false);
  });

  it("manipulates table columns and rows dynamically", () => {
    const tableData = {
      title: "Comparison",
      columns: ["Col A", "Col B"],
      rows: [["1", "2"]],
    };

    // Add Column
    const newCols = [...tableData.columns, "Col C"];
    const newRowsWithCol = tableData.rows.map((r) => [...r, ""]);
    expect(newCols.length).toBe(3);
    expect(newRowsWithCol[0].length).toBe(3);

    // Add Row
    const newRow = new Array(newCols.length).fill("");
    const newRows = [...newRowsWithCol, newRow];
    expect(newRows.length).toBe(2);
  });
});
