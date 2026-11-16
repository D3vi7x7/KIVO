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
});
