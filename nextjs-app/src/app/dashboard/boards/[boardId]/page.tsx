"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  ColorsIcon,
  CursorIcon,
  Delete02Icon,
  Drag01Icon,
  GridTableIcon,
  Image01Icon,
  KanbanIcon,
  Layers01Icon,
  Link01Icon,
  Note01Icon,
  RotateLeft01Icon,
  SparklesIcon,
  TextIcon,
  Video01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useToast } from "@/components/ui/toast";
import { ThreeModelViewer } from "@/components/boards/three-model-viewer";
import SunlitCuttingMat from "@/components/ui/sunlit-cutting-mat";

type Board = {
  id: string;
  name: string;
  description: string;
  background: string;
  viewport: { x: number; y: number; zoom: number };
};

type ElementType =
  | "note"
  | "image"
  | "video"
  | "link"
  | "palette"
  | "text"
  | "arrow"
  | "section"
  | "model3d"
  | "table";

type BoardElement = {
  id: string;
  board_id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  data: Record<string, any>;
  created_by?: string;
};

type RemoteCursor = {
  user: { email: string; name: string; color: string };
  x: number;
  y: number;
};

type ActiveUser = {
  email: string;
  name: string;
  color: string;
};

export default function BoardCanvasPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = use(params);
  const [board, setBoard] = useState<Board | null>(null);
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Tool: "select" | "hand" | "note" | "arrow" | "section" | "model3d" | "table" | "image" | "video" | "link" | "palette" | "text"
  const [activeTool, setActiveTool] = useState<string>("select");

  // Canvas Viewport Transformation
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.0);
  const [isPanning, setIsPanning] = useState(false);
  const startPanRef = useRef({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Selection & Dragging of elements
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStartOffset = useRef({ x: 0, y: 0 });
  // For sections: track child element IDs to drag together
  const sectionChildrenOffsets = useRef<Map<string, { dx: number; dy: number }>>(new Map());

  // Dynamic Node Connector & Freehand Arrow drawing state
  const [connectorSourceId, setConnectorSourceId] = useState<string | null>(null);
  const [arrowDraft, setArrowDraft] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  // Multiplayer Presence & Cursors
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const myUserRef = useRef<{ email: string; name: string; color: string } | null>(null);

  // Modals for inserting link / video / image / 3D model
  const [modalType, setModalType] = useState<"link" | "video" | "image" | "model3d" | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [modalPendingCoords, setModalPendingCoords] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // 1. Initial Load of Board & Elements
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const [bRes, eRes, meRes] = await Promise.all([
          fetch(`/api/boards/${boardId}`),
          fetch(`/api/boards/${boardId}/elements`),
          fetch("/api/auth/me"),
        ]);

        if (bRes.ok && !cancelled) {
          const bData = await bRes.json();
          setBoard(bData);
          if (bData.viewport) {
            setPan({ x: bData.viewport.x || 0, y: bData.viewport.y || 0 });
            setZoom(bData.viewport.zoom || 1.0);
          }
        }
        if (eRes.ok && !cancelled) {
          setElements(await eRes.json());
        }
        if (meRes.ok && !cancelled) {
          const me = await meRes.json();
          const email = me.email || "me@kivo.com";
          const palette = ["#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#06b6d4"];
          const color = palette[sumChars(email) % palette.length];
          myUserRef.current = { email, name: email.split("@")[0], color };
        }
      } catch {
        toast({ title: "Failed to load board" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  function sumChars(str: string) {
    return str.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  }

  // 2. WebSocket Real-time Multiplayer Connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWs = () => {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = window.location.hostname;
      const wsPort = "5000";
      const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}/boards/ws/${boardId}`;

      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "cursor:move") {
              setRemoteCursors((prev) => ({
                ...prev,
                [msg.user.email]: { user: msg.user, x: msg.x, y: msg.y },
              }));
            } else if (msg.type === "presence:join" || msg.type === "presence:leave") {
              if (msg.active_users) {
                setActiveUsers(msg.active_users);
              }
              if (msg.type === "presence:leave" && msg.user) {
                setRemoteCursors((prev) => {
                  const copy = { ...prev };
                  delete copy[msg.user.email];
                  return copy;
                });
              }
            } else if (msg.type === "element:create") {
              setElements((prev) => {
                if (prev.some((e) => e.id === msg.element.id)) return prev;
                return [...prev, msg.element];
              });
            } else if (msg.type === "element:update") {
              setElements((prev) =>
                prev.map((e) => (e.id === msg.element.id ? { ...e, ...msg.element } : e))
              );
            } else if (msg.type === "element:delete") {
              setElements((prev) => prev.filter((e) => e.id !== msg.element_id));
            }
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectWs();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [boardId]);

  // Screen to Canvas coordinate translation
  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const x = (screenX - rect.left - pan.x) / zoom;
      const y = (screenY - rect.top - pan.y) / zoom;
      return { x, y };
    },
    [pan, zoom]
  );

  // Send local cursor move via WebSocket
  const sendCursorPosition = useCallback(
    (canvasX: number, canvasY: number) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "cursor:move",
            x: Math.round(canvasX),
            y: Math.round(canvasY),
          })
        );
      }
    },
    []
  );

  // Helper: check if element is inside section
  const isElementInsideSection = (elem: BoardElement, section: BoardElement) => {
    const elemCenterX = elem.x + elem.width / 2;
    const elemCenterY = elem.y + elem.height / 2;
    return (
      elemCenterX >= section.x &&
      elemCenterX <= section.x + section.width &&
      elemCenterY >= section.y &&
      elemCenterY <= section.y + section.height
    );
  };

  // Mouse Move over Canvas
  const handleMouseMove = (e: React.MouseEvent) => {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    sendCursorPosition(x, y);

    if (isPanning) {
      const dx = e.clientX - startPanRef.current.x;
      const dy = e.clientY - startPanRef.current.y;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      startPanRef.current = { x: e.clientX, y: e.clientY };
    } else if (arrowDraft) {
      setArrowDraft((prev) => (prev ? { ...prev, endX: x, endY: y } : null));
    } else if (draggingId) {
      const newX = x - dragStartOffset.current.x;
      const newY = y - dragStartOffset.current.y;

      const draggedEl = elements.find((el) => el.id === draggingId);
      const isSection = draggedEl?.type === "section";

      // If dragging a Section, also move its contained children!
      if (isSection && sectionChildrenOffsets.current.size > 0) {
        const deltaX = newX - (draggedEl?.x || 0);
        const deltaY = newY - (draggedEl?.y || 0);

        setElements((prev) =>
          prev.map((el) => {
            if (el.id === draggingId) {
              return { ...el, x: newX, y: newY };
            }
            if (sectionChildrenOffsets.current.has(el.id)) {
              return { ...el, x: el.x + deltaX, y: el.y + deltaY };
            }
            return el;
          })
        );
      } else {
        setElements((prev) =>
          prev.map((el) => (el.id === draggingId ? { ...el, x: newX, y: newY } : el))
        );
      }

      // Broadcast move to peers
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "element:update",
            element: { id: draggingId, x: newX, y: newY },
          })
        );
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // If middle click or space key pressed or hand tool active -> start panning
    if (e.button === 1 || activeTool === "hand" || isSpacePressed) {
      setIsPanning(true);
      startPanRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x, y } = screenToCanvas(e.clientX, e.clientY);

    // Freehand Arrow drawing tool
    if (activeTool === "arrow" && !connectorSourceId) {
      setArrowDraft({ startX: x, startY: y, endX: x, endY: y });
      return;
    }

    // Canvas click with creation tool
    if (activeTool !== "select" && activeTool !== "hand" && activeTool !== "arrow") {
      handleCreateToolClick(activeTool, x, y);
      return;
    }

    // Click on empty canvas deselects
    if (e.target === containerRef.current || (e.target as HTMLElement).id === "canvas-grid") {
      setSelectedId(null);
      setConnectorSourceId(null);
    }
  };

  const handleMouseUp = async () => {
    if (isPanning) {
      setIsPanning(false);
      fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewport: { x: pan.x, y: pan.y, zoom } }),
      }).catch(() => {});
    }

    if (arrowDraft) {
      // Create freehand arrow if it has a noticeable length
      const dist = Math.hypot(arrowDraft.endX - arrowDraft.startX, arrowDraft.endY - arrowDraft.startY);
      if (dist > 15) {
        createElement("arrow", Math.min(arrowDraft.startX, arrowDraft.endX), Math.min(arrowDraft.startY, arrowDraft.endY), {
          startX: arrowDraft.startX,
          startY: arrowDraft.startY,
          endX: arrowDraft.endX,
          endY: arrowDraft.endY,
          lineStyle: "solid", // solid | dashed | dotted
          color: "#10b981",
          strokeWidth: 2.5,
          arrowEnd: true,
        });
      }
      setArrowDraft(null);
      setActiveTool("select");
    }

    if (draggingId) {
      const current = elements.find((el) => el.id === draggingId);
      if (current) {
        fetch(`/api/boards/${boardId}/elements/${draggingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: current.x, y: current.y }),
        }).catch(() => {});

        // If section children were moved, persist them too
        if (current.type === "section" && sectionChildrenOffsets.current.size > 0) {
          sectionChildrenOffsets.current.forEach((_, childId) => {
            const child = elements.find((el) => el.id === childId);
            if (child) {
              fetch(`/api/boards/${boardId}/elements/${childId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ x: child.x, y: child.y }),
              }).catch(() => {});
            }
          });
          sectionChildrenOffsets.current.clear();
        }
      }
      setDraggingId(null);
    }
  };

  // Zooming with Wheel
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom((z) => Math.min(Math.max(z * zoomFactor, 0.15), 3.0));
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  // Element Creation Router
  const handleCreateToolClick = (tool: string, x: number, y: number) => {
    if (tool === "note") {
      createElement("note", x, y, {
        text: "New idea…",
        color: "#10b981",
      });
      setActiveTool("select");
    } else if (tool === "section") {
      createElement("section", x, y, {
        title: "Section / Exploration",
        color: "rgba(255, 255, 255, 0.03)",
        borderColor: "rgba(255, 255, 255, 0.15)",
      });
      setActiveTool("select");
    } else if (tool === "table") {
      createElement("table", x, y, {
        title: "Comparison Matrix",
        columns: ["Feature", "Option A", "Option B"],
        rows: [
          ["Typography", "Inter", "Geist"],
          ["Primary Color", "Emerald", "Cyan"],
          ["Readability", "High", "Very High"],
        ],
      });
      setActiveTool("select");
    } else if (tool === "palette") {
      createElement("palette", x, y, {
        title: "Moodboard Palette",
        colors: ["#09090b", "#10b981", "#3b82f6", "#f43f5e", "#ffffff"],
      });
      setActiveTool("select");
    } else if (tool === "text") {
      createElement("text", x, y, {
        text: "Vision Statement",
        fontSize: 24,
      });
      setActiveTool("select");
    } else if (["link", "video", "image", "model3d"].includes(tool)) {
      setModalType(tool as any);
      setModalPendingCoords({ x, y });
      setModalInput("");
    }
  };

  // Create Element API Call & Peer Broadcast
  const createElement = async (type: ElementType, x: number, y: number, data: Record<string, any>) => {
    const defaultSizes: Record<ElementType, { w: number; h: number }> = {
      note: { w: 220, h: 200 },
      section: { w: 560, h: 420 },
      table: { w: 460, h: 260 },
      model3d: { w: 340, h: 280 },
      image: { w: 320, h: 240 },
      video: { w: 360, h: 220 },
      link: { w: 300, h: 180 },
      palette: { w: 280, h: 130 },
      text: { w: 260, h: 60 },
      arrow: { w: 200, h: 100 },
    };

    const size = defaultSizes[type] || { w: 220, h: 180 };
    const tempId = `elem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newElement: BoardElement = {
      id: tempId,
      board_id: boardId,
      type,
      x: Math.round(x),
      y: Math.round(y),
      width: size.w,
      height: size.h,
      rotation: 0,
      z_index: type === "section" ? 1 : elements.length + 5,
      data,
    };

    setElements((prev) => [...prev, newElement]);
    setSelectedId(newElement.id);

    try {
      const res = await fetch(`/api/boards/${boardId}/elements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newElement),
      });

      if (res.ok) {
        const saved = await res.json();
        setElements((prev) => prev.map((el) => (el.id === tempId ? saved : el)));

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "element:create",
              element: saved,
            })
          );
        }
      }
    } catch {
      toast({ title: "Failed to create element" });
    }
  };

  // Node Connector Handler (Connecting Item A to Item B)
  const handleElementConnectorClick = (targetId: string) => {
    if (activeTool !== "arrow") return;

    if (!connectorSourceId) {
      setConnectorSourceId(targetId);
      toast({ title: "Connecting node…", description: "Click target card to complete connection" });
    } else {
      if (connectorSourceId === targetId) {
        setConnectorSourceId(null);
        return;
      }

      // Create linked node connector arrow
      const source = elements.find((el) => el.id === connectorSourceId);
      const target = elements.find((el) => el.id === targetId);

      if (source && target) {
        createElement("arrow", Math.min(source.x, target.x), Math.min(source.y, target.y), {
          fromId: source.id,
          toId: target.id,
          lineStyle: "solid",
          color: "#10b981",
          strokeWidth: 2.5,
          arrowEnd: true,
        });
        toast({ title: "Items connected!" });
      }

      setConnectorSourceId(null);
      setActiveTool("select");
    }
  };

  // Modal Submit (Link, Video, Image, 3D Model)
  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalInput.trim() || !modalType || !modalPendingCoords) return;

    const coords = modalPendingCoords;
    const inputVal = modalInput.trim();

    if (modalType === "link") {
      try {
        toast({ title: "Fetching preview…", description: "Scraping link info" });
        const res = await fetch(`/api/boards/link-preview?url=${encodeURIComponent(inputVal)}`);
        const meta = res.ok ? await res.json() : { url: inputVal, title: inputVal, description: "" };

        createElement("link", coords.x, coords.y, {
          url: meta.url || inputVal,
          title: meta.title || inputVal,
          description: meta.description || "",
          image: meta.image || null,
          favicon: meta.favicon || null,
        });
      } catch {
        createElement("link", coords.x, coords.y, { url: inputVal, title: inputVal });
      }
    } else if (modalType === "video") {
      let embedUrl = inputVal;
      const ytMatch = inputVal.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
      if (ytMatch) {
        embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
      }
      createElement("video", coords.x, coords.y, {
        url: embedUrl,
        rawUrl: inputVal,
      });
    } else if (modalType === "image") {
      createElement("image", coords.x, coords.y, {
        url: inputVal,
        caption: "",
      });
    } else if (modalType === "model3d") {
      // Validate GLB or GLTF
      const clean = inputVal.toLowerCase().split("?")[0];
      if (!clean.endsWith(".glb") && !clean.endsWith(".gltf")) {
        toast({ title: "Invalid format", description: "3D models must be .glb or .gltf files" });
        return;
      }
      createElement("model3d", coords.x, coords.y, {
        url: inputVal,
        name: inputVal.split("/").pop() || "3D Asset",
      });
    }

    setModalType(null);
    setModalInput("");
    setModalPendingCoords(null);
    setActiveTool("select");
  };

  // Drag-and-drop Image or 3D Model Upload directly onto Canvas
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0];
    const isImage = file.type.startsWith("image/");
    const is3D = file.name.toLowerCase().endsWith(".glb") || file.name.toLowerCase().endsWith(".gltf");

    if (!isImage && !is3D) {
      toast({ title: "Unsupported file", description: "Drop an image or .glb / .gltf 3D model" });
      return;
    }

    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    const formData = new FormData();
    formData.append("file", file);

    try {
      toast({ title: "Uploading asset…", description: file.name });
      const res = await fetch("/api/boards/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (is3D) {
          createElement("model3d", x, y, { url: data.url, name: file.name });
        } else {
          createElement("image", x, y, { url: data.url, caption: file.name });
        }
      } else {
        toast({ title: "Upload failed" });
      }
    } catch {
      toast({ title: "Failed to upload asset" });
    }
  };

  // Handle direct file upload from button picker
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const is3D = file.name.toLowerCase().endsWith(".glb") || file.name.toLowerCase().endsWith(".gltf");

    const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
    const formData = new FormData();
    formData.append("file", file);

    try {
      toast({ title: "Uploading file…", description: file.name });
      const res = await fetch("/api/boards/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (is3D) {
          createElement("model3d", center.x, center.y, { url: data.url, name: file.name });
        } else {
          createElement("image", center.x, center.y, { url: data.url, caption: file.name });
        }
      }
    } catch {
      toast({ title: "Upload failed" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Delete Element
  const handleDeleteElement = async (id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id && el.data?.fromId !== id && el.data?.toId !== id));
    if (selectedId === id) setSelectedId(null);

    try {
      await fetch(`/api/boards/${boardId}/elements/${id}`, { method: "DELETE" });
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "element:delete",
            element_id: id,
          })
        );
      }
    } catch {
      // ignore
    }
  };

  // Keyboard Shortcuts: Delete, Esc, Space, Tools
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space") {
        setIsSpacePressed(true);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        handleDeleteElement(selectedId);
      } else if (e.key === "Escape") {
        setSelectedId(null);
        setConnectorSourceId(null);
        setActiveTool("select");
      } else if (e.key === "v" || e.key === "V") {
        setActiveTool("select");
      } else if (e.key === "h" || e.key === "H") {
        setActiveTool("hand");
      } else if (e.key === "n" || e.key === "N") {
        setActiveTool("note");
      } else if (e.key === "a" || e.key === "A") {
        setActiveTool("arrow");
      } else if (e.key === "s" || e.key === "S") {
        setActiveTool("section");
      } else if (e.key === "t" || e.key === "T") {
        setActiveTool("text");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [selectedId]);

  // Calculate dynamic endpoints for linked node connector
  const getConnectorPoints = (arrow: BoardElement) => {
    if (arrow.data.fromId && arrow.data.toId) {
      const from = elements.find((el) => el.id === arrow.data.fromId);
      const to = elements.find((el) => el.id === arrow.data.toId);

      if (from && to) {
        const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
        const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

        const dx = toCenter.x - fromCenter.x;
        const dy = toCenter.y - fromCenter.y;

        let start = { ...fromCenter };
        let end = { ...toCenter };

        if (Math.abs(dx) > Math.abs(dy)) {
          start.x = dx > 0 ? from.x + from.width : from.x;
          end.x = dx > 0 ? to.x : to.x + to.width;
        } else {
          start.y = dy > 0 ? from.y + from.height : from.y;
          end.y = dy > 0 ? to.y : to.y + to.height;
        }
        return { start, end };
      }
    }

    return {
      start: { x: arrow.data.startX ?? arrow.x, y: arrow.data.startY ?? arrow.y },
      end: { x: arrow.data.endX ?? arrow.x + arrow.width, y: arrow.data.endY ?? arrow.y + arrow.height },
    };
  };

  return (
    <div
      className="fixed inset-0 z-40 w-screen h-screen overflow-hidden select-none bg-zinc-950 text-white"
      onWheel={handleWheel}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Hidden file input for 3D model and image uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.gif,.glb,.gltf"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* ------------------------------------------------------------- */}
      {/* 1. FLOATING TOP HEADER */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute top-4 left-4 right-4 z-40 flex items-center justify-between pointer-events-none">
        {/* Left: Back & Title */}
        <div className="flex items-center gap-2 pointer-events-auto bg-zinc-900/90 border border-white/10 rounded-2xl p-1.5 shadow-xl backdrop-blur-md">
          <Link
            href="/dashboard/boards"
            className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Back to boards"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Link>

          <div className="h-5 w-px bg-white/10" />

          <div className="px-2">
            <h1 className="text-sm font-semibold text-white tracking-tight line-clamp-1">
              {board?.name || "Loading board…"}
            </h1>
          </div>
        </div>

        {/* Right: Multiplayer Presence Avatars & Connection Pill */}
        <div className="flex items-center gap-3 pointer-events-auto">
          {/* Active Collaborators */}
          <div className="flex items-center -space-x-1.5 bg-zinc-900/90 border border-white/10 rounded-2xl px-2.5 py-1.5 shadow-xl backdrop-blur-md">
            {activeUsers.slice(0, 5).map((user) => (
              <div
                key={user.email}
                className="size-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-zinc-900 shadow-sm"
                style={{ backgroundColor: user.color }}
                title={`${user.name} (${user.email})`}
              >
                {user.name.slice(0, 2).toUpperCase()}
              </div>
            ))}
            {activeUsers.length === 0 && myUserRef.current && (
              <div
                className="size-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-zinc-900"
                style={{ backgroundColor: myUserRef.current.color }}
                title={myUserRef.current.name}
              >
                {myUserRef.current.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          {/* Connection Status Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-zinc-900/90 border border-white/10 shadow-xl backdrop-blur-md text-xs font-medium">
            <span
              className={`size-2 rounded-full ${
                wsConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            <span className="text-white/70 text-[11px]">
              {wsConnected ? "Live Multiplayer" : "Connecting…"}
            </span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. INFINITE CANVAS VIEWPORT */}
      {/* ------------------------------------------------------------- */}
      <div
        ref={containerRef}
        id="canvas-grid"
        className={`w-full h-full relative cursor-${activeTool === "hand" || isPanning ? "grab" : "default"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          backgroundImage:
            board?.background === "grid"
              ? `linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)`
              : board?.background === "dots"
              ? `radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)`
              : "none",
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Sunlit Cutting Mat surface background (default for boards) */}
        {(board?.background === "sunlit" || !board?.background || (board.background !== "dots" && board.background !== "grid" && board.background !== "plain")) && (
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <SunlitCuttingMat className="w-full h-full" height="100%" />
          </div>
        )}
        {/* Transform Layer for all Moodboard elements */}
        <div
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          }}
        >
          {/* SVG OVERLAY: Arrows, Connectors & Draft Arrows */}
          <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-10">
            <defs>
              <marker
                id="arrowhead-emerald"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 8 5 L 0 9 z" fill="#10b981" />
              </marker>
              <marker
                id="arrowhead-white"
                viewBox="0 0 10 10"
                refX="6"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 8 5 L 0 9 z" fill="#ffffff" />
              </marker>
            </defs>

            {/* Render saved arrows and node connectors */}
            {elements
              .filter((el) => el.type === "arrow")
              .map((arrow) => {
                const { start, end } = getConnectorPoints(arrow);
                const isSelected = selectedId === arrow.id;
                const dash =
                  arrow.data.lineStyle === "dashed"
                    ? "8 6"
                    : arrow.data.lineStyle === "dotted"
                    ? "3 3"
                    : "none";
                const strokeColor = isSelected ? "#38bdf8" : arrow.data.color || "#10b981";

                return (
                  <g
                    key={arrow.id}
                    className="pointer-events-auto cursor-pointer group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(arrow.id);
                    }}
                  >
                    {/* Wider transparent hit zone */}
                    <line
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                      stroke="transparent"
                      strokeWidth={14}
                    />
                    {/* Actual visible arrow */}
                    <line
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                      stroke={strokeColor}
                      strokeWidth={arrow.data.strokeWidth || 2.5}
                      strokeDasharray={dash}
                      markerEnd={arrow.data.arrowEnd !== false ? "url(#arrowhead-emerald)" : undefined}
                      className="transition-all"
                    />
                  </g>
                );
              })}

            {/* Currently drawing arrow draft */}
            {arrowDraft && (
              <line
                x1={arrowDraft.startX}
                y1={arrowDraft.startY}
                x2={arrowDraft.endX}
                y2={arrowDraft.endY}
                stroke="#10b981"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                markerEnd="url(#arrowhead-emerald)"
              />
            )}
          </svg>

          {/* RENDER ALL CARDS & SECTIONS */}
          {elements.map((el) => {
            const isSelected = selectedId === el.id;
            const isConnecting = connectorSourceId === el.id;

            return (
              <div
                key={el.id}
                onMouseDown={(e) => {
                  e.stopPropagation();

                  // If using connector tool, handle connection
                  if (activeTool === "arrow") {
                    handleElementConnectorClick(el.id);
                    return;
                  }

                  setSelectedId(el.id);
                  if (activeTool === "select") {
                    setDraggingId(el.id);
                    const { x, y } = screenToCanvas(e.clientX, e.clientY);
                    dragStartOffset.current = { x: x - el.x, y: y - el.y };

                    // If dragging a Section, record offsets of all child elements inside it!
                    if (el.type === "section") {
                      sectionChildrenOffsets.current.clear();
                      elements.forEach((other) => {
                        if (other.id !== el.id && isElementInsideSection(other, el)) {
                          sectionChildrenOffsets.current.set(other.id, {
                            dx: other.x - el.x,
                            dy: other.y - el.y,
                          });
                        }
                      });
                    }
                  }
                }}
                className={`absolute pointer-events-auto group transition-shadow ${
                  isConnecting
                    ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-zinc-950 animate-pulse"
                    : isSelected
                    ? "ring-2 ring-emerald-400 shadow-2xl"
                    : el.type === "section"
                    ? ""
                    : "shadow-md"
                }`}
                style={{
                  transform: `translate3d(${el.x}px, ${el.y}px, 0) rotate(${el.rotation}deg)`,
                  width: `${el.width}px`,
                  minHeight: `${el.height}px`,
                  zIndex: el.type === "section" ? 1 : isSelected ? 50 : el.z_index,
                }}
              >
                {/* 1. FIGMA-STYLE SECTION / FRAME */}
                {el.type === "section" && (
                  <div className="relative w-full h-full rounded-2xl border-2 border-dashed border-white/20 bg-white/[0.03] backdrop-blur-[2px] transition-all group-hover:border-white/30">
                    {/* Section Top Header Tab */}
                    <div className="absolute -top-7 left-0 flex items-center gap-1.5 px-3 py-1 rounded-t-xl bg-zinc-900 border-t border-x border-white/20 text-xs font-semibold text-white/90 shadow-md">
                      <HugeiconsIcon icon={Layers01Icon} className="size-3 text-emerald-400" />
                      <input
                        type="text"
                        value={el.data.title || "Section"}
                        onChange={(e) => {
                          const val = e.target.value;
                          setElements((prev) =>
                            prev.map((item) =>
                              item.id === el.id ? { ...item, data: { ...item.data, title: val } } : item
                            )
                          );
                        }}
                        onBlur={() => {
                          fetch(`/api/boards/${boardId}/elements/${el.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ data: { title: el.data.title } }),
                          });
                        }}
                        className="bg-transparent border-0 focus:outline-none text-xs font-bold text-white max-w-[200px]"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteElement(el.id);
                        }}
                        className="text-white/30 hover:text-red-400 p-0.5 ml-1"
                        title="Delete Section"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-3" />
                      </button>
                    </div>

                    {/* Section resize handle bottom right */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const startX = e.clientX;
                        const startY = e.clientY;
                        const startW = el.width;
                        const startH = el.height;

                        const handleResizeMove = (moveEvt: MouseEvent) => {
                          const dw = (moveEvt.clientX - startX) / zoom;
                          const dh = (moveEvt.clientY - startY) / zoom;
                          const newW = Math.max(startW + dw, 200);
                          const newH = Math.max(startH + dh, 150);
                          setElements((prev) =>
                            prev.map((item) => (item.id === el.id ? { ...item, width: newW, height: newH } : item))
                          );
                        };

                        const handleResizeUp = () => {
                          window.removeEventListener("mousemove", handleResizeMove);
                          window.removeEventListener("mouseup", handleResizeUp);
                          const finalEl = elements.find((item) => item.id === el.id);
                          if (finalEl) {
                            fetch(`/api/boards/${boardId}/elements/${el.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ width: finalEl.width, height: finalEl.height }),
                            });
                          }
                        };

                        window.addEventListener("mousemove", handleResizeMove);
                        window.addEventListener("mouseup", handleResizeUp);
                      }}
                      className="absolute bottom-1 right-1 size-4 cursor-se-resize flex items-center justify-center text-white/30 hover:text-emerald-400"
                    >
                      <span className="text-[10px]">⌟</span>
                    </div>
                  </div>
                )}

                {/* 2. THREE.JS 3D MODEL PREVIEW */}
                {el.type === "model3d" && (
                  <div className="w-full h-full rounded-2xl overflow-hidden border border-white/20 bg-zinc-900 shadow-2xl flex flex-col">
                    <div className="flex-1 w-full relative">
                      <ThreeModelViewer url={el.data.url} name={el.data.name} />
                    </div>
                    <div className="p-2 bg-zinc-900/95 border-t border-white/10 flex items-center justify-between text-xs text-white/70">
                      <span className="truncate max-w-[200px] font-medium">{el.data.name || "3D Asset"}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteElement(el.id);
                        }}
                        className="text-white/30 hover:text-red-400 p-1"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. INTERACTIVE MOODBOARD TABLE */}
                {el.type === "table" && (
                  <div className="p-4 rounded-2xl border border-white/20 bg-zinc-900/95 backdrop-blur-md shadow-2xl flex flex-col">
                    {/* Table Title Header */}
                    <div className="flex items-center justify-between mb-3">
                      <input
                        type="text"
                        value={el.data.title || "Table"}
                        onChange={(e) => {
                          const val = e.target.value;
                          setElements((prev) =>
                            prev.map((item) =>
                              item.id === el.id ? { ...item, data: { ...item.data, title: val } } : item
                            )
                          );
                        }}
                        className="bg-transparent font-bold text-sm text-white focus:outline-none"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteElement(el.id);
                        }}
                        className="text-white/30 hover:text-red-400 p-1"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                      </button>
                    </div>

                    {/* Table Grid */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-white/10 text-white/60">
                            {(el.data.columns || []).map((col: string, colIdx: number) => (
                              <th key={colIdx} className="p-2 font-semibold">
                                <input
                                  type="text"
                                  value={col}
                                  onChange={(e) => {
                                    const newCols = [...el.data.columns];
                                    newCols[colIdx] = e.target.value;
                                    setElements((prev) =>
                                      prev.map((item) =>
                                        item.id === el.id ? { ...item, data: { ...item.data, columns: newCols } } : item
                                      )
                                    );
                                  }}
                                  className="w-full bg-transparent text-white/80 focus:outline-none font-semibold"
                                />
                              </th>
                            ))}
                            <th className="w-6 p-1">
                              <button
                                onClick={() => {
                                  const newCols = [...(el.data.columns || []), `Col ${el.data.columns.length + 1}`];
                                  const newRows = (el.data.rows || []).map((r: string[]) => [...r, ""]);
                                  setElements((prev) =>
                                    prev.map((item) =>
                                      item.id === el.id ? { ...item, data: { ...item.data, columns: newCols, rows: newRows } } : item
                                    )
                                  );
                                }}
                                className="size-5 rounded hover:bg-white/10 text-emerald-400 flex items-center justify-center"
                                title="Add Column"
                              >
                                +
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(el.data.rows || []).map((row: string[], rowIdx: number) => (
                            <tr key={rowIdx} className="border-b border-white/5 hover:bg-white/5 group/row">
                              {row.map((cell: string, cellIdx: number) => (
                                <td key={cellIdx} className="p-2">
                                  <input
                                    type="text"
                                    value={cell}
                                    onChange={(e) => {
                                      const newRows = el.data.rows.map((r: string[], rI: number) =>
                                        rI === rowIdx ? r.map((c, cI) => (cI === cellIdx ? e.target.value : c)) : r
                                      );
                                      setElements((prev) =>
                                        prev.map((item) =>
                                          item.id === el.id ? { ...item, data: { ...item.data, rows: newRows } } : item
                                        )
                                      );
                                    }}
                                    className="w-full bg-transparent text-white/90 focus:outline-none"
                                  />
                                </td>
                              ))}
                              <td className="w-6 p-1 text-right">
                                <button
                                  onClick={() => {
                                    const newRows = el.data.rows.filter((_: any, idx: number) => idx !== rowIdx);
                                    setElements((prev) =>
                                      prev.map((item) =>
                                        item.id === el.id ? { ...item, data: { ...item.data, rows: newRows } } : item
                                      )
                                    );
                                  }}
                                  className="size-4 opacity-0 group-hover/row:opacity-100 hover:text-red-400 text-white/30 text-[10px]"
                                  title="Delete Row"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <button
                      onClick={() => {
                        const newRow = new Array(el.data.columns.length).fill("");
                        const newRows = [...(el.data.rows || []), newRow];
                        setElements((prev) =>
                          prev.map((item) =>
                            item.id === el.id ? { ...item, data: { ...item.data, rows: newRows } } : item
                          )
                        );
                      }}
                      className="mt-2 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium self-start flex items-center gap-1"
                    >
                      + Add Row
                    </button>
                  </div>
                )}

                {/* 4. STICKY NOTE */}
                {el.type === "note" && (
                  <div
                    className="p-4 rounded-2xl flex flex-col justify-between h-full backdrop-blur-md border border-white/20 transition-all text-zinc-950 font-medium"
                    style={{ backgroundColor: el.data.color || "#10b981" }}
                  >
                    <textarea
                      value={el.data.text || ""}
                      onChange={(e) => {
                        const newText = e.target.value;
                        setElements((prev) =>
                          prev.map((item) =>
                            item.id === el.id ? { ...item, data: { ...item.data, text: newText } } : item
                          )
                        );
                      }}
                      onBlur={() => {
                        fetch(`/api/boards/${boardId}/elements/${el.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ data: { text: el.data.text } }),
                        });
                      }}
                      className="w-full bg-transparent resize-none focus:outline-none text-sm placeholder:text-black/50 text-black leading-relaxed"
                      rows={5}
                      placeholder="Type a thought or brainstorming note…"
                    />

                    {/* Color Swatch Selector for Sticky Notes */}
                    <div className="flex items-center justify-between pt-2 border-t border-black/10 mt-2">
                      <div className="flex items-center gap-1.5">
                        {["#10b981", "#fbbf24", "#f43f5e", "#a855f7", "#38bdf8", "#e4e4e7"].map((c) => (
                          <button
                            key={c}
                            onClick={(e) => {
                              e.stopPropagation();
                              setElements((prev) =>
                                prev.map((item) =>
                                  item.id === el.id ? { ...item, data: { ...item.data, color: c } } : item
                                )
                              );
                              fetch(`/api/boards/${boardId}/elements/${el.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ data: { color: c } }),
                              });
                            }}
                            className="size-3.5 rounded-full border border-black/20 hover:scale-125 transition-transform"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteElement(el.id);
                        }}
                        className="text-black/40 hover:text-red-600 transition-colors p-1"
                        title="Delete note"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 5. IMAGE */}
                {el.type === "image" && (
                  <div className="rounded-2xl overflow-hidden border border-white/20 bg-zinc-900 group shadow-xl">
                    <img
                      src={el.data.url}
                      alt={el.data.caption || "Moodboard Asset"}
                      className="w-full object-cover rounded-t-2xl max-h-96"
                    />
                    <div className="p-2.5 bg-zinc-900/90 flex items-center justify-between">
                      <span className="text-xs text-white/70 truncate">{el.data.caption || "Image"}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteElement(el.id);
                        }}
                        className="text-white/30 hover:text-red-400 transition-colors p-1"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 6. VIDEO */}
                {el.type === "video" && (
                  <div className="rounded-2xl overflow-hidden border border-white/20 bg-zinc-900 shadow-xl">
                    <div className="relative pt-[56.25%] w-full bg-black">
                      <iframe
                        src={el.data.url}
                        title="Video player"
                        className="absolute inset-0 w-full h-full rounded-t-2xl border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                    <div className="p-2 bg-zinc-900 flex justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteElement(el.id);
                        }}
                        className="text-white/30 hover:text-red-400 p-1"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 7. LINK CARD */}
                {el.type === "link" && (
                  <div className="rounded-2xl border border-white/20 bg-zinc-900/95 overflow-hidden backdrop-blur-md shadow-xl flex flex-col">
                    {el.data.image && (
                      <div className="h-28 w-full overflow-hidden bg-black/40">
                        <img src={el.data.image} alt="Link preview" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="p-3.5 flex flex-col justify-between flex-1">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          {el.data.favicon && <img src={el.data.favicon} alt="" className="size-4 rounded shrink-0" />}
                          <h4 className="text-xs font-semibold text-white truncate">{el.data.title || el.data.url}</h4>
                        </div>
                        {el.data.description && (
                          <p className="text-[11px] text-white/50 line-clamp-2 leading-relaxed mb-2">
                            {el.data.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[10px]">
                        <a
                          href={el.data.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-400 hover:underline truncate max-w-[180px]"
                        >
                          {el.data.url}
                        </a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteElement(el.id);
                          }}
                          className="text-white/30 hover:text-red-400 p-1"
                        >
                          <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 8. COLOR PALETTE */}
                {el.type === "palette" && (
                  <div className="p-4 rounded-2xl border border-white/20 bg-zinc-900/95 backdrop-blur-md shadow-xl">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-white/90">{el.data.title || "Color Palette"}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteElement(el.id);
                        }}
                        className="text-white/30 hover:text-red-400 p-1"
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 h-12 rounded-xl overflow-hidden">
                      {(el.data.colors || []).map((hex: string, i: number) => (
                        <div
                          key={i}
                          onClick={() => {
                            navigator.clipboard.writeText(hex);
                            toast({ title: `Copied ${hex} to clipboard!` });
                          }}
                          className="flex-1 h-full cursor-pointer hover:scale-105 transition-transform flex items-end justify-center pb-1 text-[9px] font-mono text-white/80 group/swatch"
                          style={{ backgroundColor: hex }}
                          title={`Click to copy ${hex}`}
                        >
                          <span className="opacity-0 group-hover/swatch:opacity-100 bg-black/60 px-1 rounded text-[8px]">
                            {hex}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 9. TEXT CARD */}
                {el.type === "text" && (
                  <div className="p-2 border border-transparent hover:border-white/20 rounded-xl">
                    <input
                      type="text"
                      value={el.data.text || ""}
                      onChange={(e) => {
                        const newText = e.target.value;
                        setElements((prev) =>
                          prev.map((item) =>
                            item.id === el.id ? { ...item, data: { ...item.data, text: newText } } : item
                          )
                        );
                      }}
                      onBlur={() => {
                        fetch(`/api/boards/${boardId}/elements/${el.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ data: { text: el.data.text } }),
                        });
                      }}
                      className="w-full bg-transparent text-white font-bold text-xl tracking-tight focus:outline-none"
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Remote Multiplayer Peer Cursors */}
          {Object.entries(remoteCursors).map(([email, cursor]) => (
            <div
              key={email}
              className="absolute pointer-events-none transition-all duration-75 ease-out z-50 flex items-start gap-1"
              style={{
                transform: `translate3d(${cursor.x}px, ${cursor.y}px, 0)`,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: cursor.user.color }}>
                <path
                  d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
                  fill="currentColor"
                  stroke="white"
                  strokeWidth="1.5"
                />
              </svg>
              <div
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white shadow-md whitespace-nowrap"
                style={{ backgroundColor: cursor.user.color }}
              >
                {cursor.user.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. FLOATING TOOL DOCK (BOTTOM CENTER) */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 p-1.5 rounded-2xl bg-zinc-900/95 border border-white/15 shadow-2xl backdrop-blur-xl">
        {[
          { id: "select", label: "Select (V)", icon: CursorIcon },
          { id: "hand", label: "Pan (H / Space)", icon: Drag01Icon },
          { id: "note", label: "Sticky Note (N)", icon: Note01Icon },
          { id: "arrow", label: "Arrow & Connector (A)", icon: ArrowRight01Icon },
          { id: "section", label: "Section Group (S)", icon: Layers01Icon },
          { id: "model3d", label: "3D Model (GLB/GLTF)", icon: SparklesIcon },
          { id: "table", label: "Table Matrix", icon: GridTableIcon },
          { id: "image", label: "Image (I)", icon: Image01Icon },
          { id: "video", label: "Video (M)", icon: Video01Icon },
          { id: "link", label: "Link Card (L)", icon: Link01Icon },
          { id: "palette", label: "Palette (C)", icon: ColorsIcon },
          { id: "text", label: "Text (T)", icon: TextIcon },
        ].map((tool) => (
          <button
            key={tool.id}
            onClick={() => {
              setActiveTool(tool.id);
              if (tool.id === "arrow") {
                toast({
                  title: "Arrow & Connector Tool",
                  description: "Drag on canvas for freehand arrow, or click a card to connect items!",
                });
              } else if (tool.id === "model3d") {
                const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
                setModalType("model3d");
                setModalPendingCoords(center);
                setModalInput("");
              } else if (["link", "video", "image"].includes(tool.id)) {
                const center = screenToCanvas(window.innerWidth / 2, window.innerHeight / 2);
                setModalType(tool.id as any);
                setModalPendingCoords(center);
                setModalInput("");
              }
            }}
            className={`p-2.5 rounded-xl flex items-center justify-center transition-all ${
              activeTool === tool.id
                ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20 scale-105 font-bold"
                : "text-white/70 hover:text-white hover:bg-white/10"
            }`}
            title={tool.label}
          >
            <HugeiconsIcon icon={tool.icon} className="size-4" />
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. ZOOM CONTROLS (BOTTOM RIGHT) */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute bottom-6 right-6 z-40 flex items-center gap-1 bg-zinc-900/90 border border-white/15 rounded-2xl p-1.5 shadow-xl backdrop-blur-md text-xs font-semibold">
        <button
          onClick={() => setZoom((z) => Math.max(z - 0.15, 0.15))}
          className="px-2 py-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
        >
          -
        </button>
        <span
          onClick={() => {
            setZoom(1.0);
            setPan({ x: 0, y: 0 });
          }}
          className="px-1 text-white/90 cursor-pointer hover:text-emerald-400"
          title="Reset to 100%"
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(z + 0.15, 3.0))}
          className="px-2 py-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
        >
          +
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 5. QUICK INSERT MODAL (LINK, VIDEO, IMAGE, 3D MODEL) */}
      {/* ------------------------------------------------------------- */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-white/15 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1">
              Add{" "}
              {modalType === "link"
                ? "Reference Link"
                : modalType === "video"
                ? "Video Embed"
                : modalType === "model3d"
                ? "3D Model (.glb / .gltf)"
                : "Image URL"}
            </h3>
            <p className="text-xs text-white/60 mb-4">
              {modalType === "link"
                ? "Paste any website or article URL to generate a smart card."
                : modalType === "video"
                ? "Paste a YouTube, Vimeo, Loom, or MP4 link."
                : modalType === "model3d"
                ? "Paste a direct .glb or .gltf URL, or upload from your computer below."
                : "Paste an image URL to place onto your moodboard."}
            </p>

            <form onSubmit={handleModalSubmit} className="space-y-4">
              <input
                type="text"
                autoFocus
                required={modalType !== "model3d"}
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                placeholder="https://…"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400 placeholder:text-white/30"
              />

              {modalType === "model3d" && (
                <div className="pt-1 border-t border-white/10">
                  <p className="text-[11px] text-white/50 mb-2">Or select from your files:</p>
                  <button
                    type="button"
                    onClick={() => {
                      setModalType(null);
                      fileInputRef.current?.click();
                    }}
                    className="w-full py-2 rounded-xl bg-white/10 border border-white/15 text-xs text-white/90 hover:bg-white/20 font-medium transition-colors"
                  >
                    Browse .GLB / .GLTF file
                  </button>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalType(null);
                    setActiveTool("select");
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs text-white/70 hover:text-white hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!modalInput.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400 disabled:opacity-50"
                >
                  Place onto Canvas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
