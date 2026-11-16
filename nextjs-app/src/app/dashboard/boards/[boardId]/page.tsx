"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ColorsIcon,
  CursorIcon,
  Delete02Icon,
  Download01Icon,
  Drag01Icon,
  Image01Icon,
  InformationCircleIcon,
  KanbanIcon,
  Link01Icon,
  Note01Icon,
  Search01Icon,
  SparklesIcon,
  TextIcon,
  Video01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useToast } from "@/components/ui/toast";

type Board = {
  id: string;
  name: string;
  description: string;
  background: string;
  viewport: { x: number; y: number; zoom: number };
};

type ElementType = "note" | "image" | "video" | "link" | "palette" | "text";

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

  // Active Tool: "select" | "hand" | "note" | "image" | "video" | "link" | "palette" | "text"
  const [activeTool, setActiveTool] = useState<string>("select");

  // Canvas Viewport Transformation
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.0);
  const [isPanning, setIsPanning] = useState(false);
  const startPanRef = useRef({ x: 0, y: 0 });

  // Selection & Dragging of elements
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStartOffset = useRef({ x: 0, y: 0 });

  // Multiplayer Presence & Cursors
  const [remoteCursors, setRemoteCursors] = useState<Record<string, RemoteCursor>>({});
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const myUserRef = useRef<{ email: string; name: string; color: string } | null>(null);

  // Quick modals for inserting link / video / image URL
  const [modalType, setModalType] = useState<"link" | "video" | "image" | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [modalPendingCoords, setModalPendingCoords] = useState<{ x: number; y: number } | null>(null);

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
      // Connect to FastAPI WebSocket endpoint
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // Connect to port 5000 directly or via proxy
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
          // Try reconnect in 3s
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

  // Keyboard tracking for Space bar panning
  const [isSpacePressed, setIsSpacePressed] = useState(false);
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

  // Mouse Move over Canvas
  const handleMouseMove = (e: React.MouseEvent) => {
    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    sendCursorPosition(x, y);

    if (isPanning) {
      const dx = e.clientX - startPanRef.current.x;
      const dy = e.clientY - startPanRef.current.y;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      startPanRef.current = { x: e.clientX, y: e.clientY };
    } else if (draggingId) {
      const newX = x - dragStartOffset.current.x;
      const newY = y - dragStartOffset.current.y;

      // Update state locally
      setElements((prev) =>
        prev.map((el) => (el.id === draggingId ? { ...el, x: newX, y: newY } : el))
      );

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

    // Canvas click with creation tool
    if (activeTool !== "select" && activeTool !== "hand") {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      handleCreateToolClick(activeTool, x, y);
      return;
    }

    // Click on empty canvas deselects
    if (e.target === containerRef.current || (e.target as HTMLElement).id === "canvas-grid") {
      setSelectedId(null);
    }
  };

  const handleMouseUp = async () => {
    if (isPanning) {
      setIsPanning(false);
      // Save viewport to board
      fetch(`/api/boards/${boardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewport: { x: pan.x, y: pan.y, zoom } }),
      }).catch(() => {});
    }

    if (draggingId) {
      const current = elements.find((el) => el.id === draggingId);
      if (current) {
        // Persist final dragged position to API
        fetch(`/api/boards/${boardId}/elements/${draggingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: current.x, y: current.y }),
        }).catch(() => {});
      }
      setDraggingId(null);
    }
  };

  // Zooming with Wheel
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom((z) => Math.min(Math.max(z * zoomFactor, 0.2), 3.0));
    } else {
      // Pan with scroll
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  // Element Creation Router
  const handleCreateToolClick = (tool: string, x: number, y: number) => {
    if (tool === "note") {
      createElement("note", x, y, {
        text: "New idea…",
        color: "#10b981", // emerald moodboard default
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
    } else if (tool === "link" || tool === "video" || tool === "image") {
      setModalType(tool);
      setModalPendingCoords({ x, y });
      setModalInput("");
    }
  };

  // Create Element API Call & Peer Broadcast
  const createElement = async (type: ElementType, x: number, y: number, data: Record<string, any>) => {
    const defaultSizes: Record<ElementType, { w: number; h: number }> = {
      note: { w: 220, h: 200 },
      image: { w: 320, h: 240 },
      video: { w: 360, h: 220 },
      link: { w: 300, h: 180 },
      palette: { w: 280, h: 130 },
      text: { w: 260, h: 60 },
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
      z_index: elements.length + 1,
      data,
    };

    // Optimistic UI
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
        // Replace tempId with server ID if different
        setElements((prev) => prev.map((el) => (el.id === tempId ? saved : el)));

        // Broadcast to WebSocket peers
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

  // Modal Submit (Link, Video, Image)
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
      // Determine YouTube vs direct MP4
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
    }

    setModalType(null);
    setModalInput("");
    setModalPendingCoords(null);
    setActiveTool("select");
  };

  // Drag-and-drop Image Upload directly onto Canvas
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only images are supported for drag and drop" });
      return;
    }

    const { x, y } = screenToCanvas(e.clientX, e.clientY);
    const formData = new FormData();
    formData.append("file", file);

    try {
      toast({ title: "Uploading image…", description: file.name });
      const res = await fetch("/api/boards/upload", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        createElement("image", x, y, { url: data.url, caption: file.name });
      }
    } catch {
      toast({ title: "Failed to upload image" });
    }
  };

  // Delete Element
  const handleDeleteElement = async (id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
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

  // Keyboard Shortcuts: Delete, Esc, Space
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space") {
        setIsSpacePressed(true);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        handleDeleteElement(selectedId);
      } else if (e.key === "Escape") {
        setSelectedId(null);
        setActiveTool("select");
      } else if (e.key === "v" || e.key === "V") {
        setActiveTool("select");
      } else if (e.key === "h" || e.key === "H") {
        setActiveTool("hand");
      } else if (e.key === "n" || e.key === "N") {
        setActiveTool("note");
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

  return (
    <div
      className="relative w-screen h-screen overflow-hidden select-none bg-zinc-950 text-white"
      onWheel={handleWheel}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
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
        className={`w-full h-full cursor-${activeTool === "hand" || isPanning ? "grab" : "default"}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          backgroundImage:
            board?.background === "grid"
              ? `linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)`
              : board?.background === "plain"
              ? "none"
              : `radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)`,
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      >
        {/* Transform Layer for all Moodboard elements */}
        <div
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
          }}
        >
          {elements.map((el) => {
            const isSelected = selectedId === el.id;

            return (
              <div
                key={el.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setSelectedId(el.id);
                  if (activeTool === "select") {
                    setDraggingId(el.id);
                    const { x, y } = screenToCanvas(e.clientX, e.clientY);
                    dragStartOffset.current = { x: x - el.x, y: y - el.y };
                  }
                }}
                className={`absolute pointer-events-auto group transition-shadow ${
                  isSelected ? "ring-2 ring-emerald-400 shadow-2xl" : "shadow-md"
                }`}
                style={{
                  transform: `translate3d(${el.x}px, ${el.y}px, 0) rotate(${el.rotation}deg)`,
                  width: `${el.width}px`,
                  minHeight: `${el.height}px`,
                  zIndex: isSelected ? 50 : el.z_index,
                }}
              >
                {/* Moodboard Element Renderers */}
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
                            item.id === el.id
                              ? { ...item, data: { ...item.data, text: newText } }
                              : item
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
                        {["#10b981", "#fbbf24", "#f43f5e", "#a855f7", "#38bdf8", "#e4e4e7"].map(
                          (c) => (
                            <button
                              key={c}
                              onClick={(e) => {
                                e.stopPropagation();
                                setElements((prev) =>
                                  prev.map((item) =>
                                    item.id === el.id
                                      ? { ...item, data: { ...item.data, color: c } }
                                      : item
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
                          )
                        )}
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

                {el.type === "image" && (
                  <div className="rounded-2xl overflow-hidden border border-white/20 bg-zinc-900 group shadow-xl">
                    <img
                      src={el.data.url}
                      alt={el.data.caption || "Moodboard Asset"}
                      className="w-full object-cover rounded-t-2xl max-h-96"
                    />
                    <div className="p-2.5 bg-zinc-900/90 flex items-center justify-between">
                      <span className="text-xs text-white/70 truncate">
                        {el.data.caption || "Image"}
                      </span>
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

                {el.type === "link" && (
                  <div className="rounded-2xl border border-white/20 bg-zinc-900/95 overflow-hidden backdrop-blur-md shadow-xl flex flex-col">
                    {el.data.image && (
                      <div className="h-28 w-full overflow-hidden bg-black/40">
                        <img
                          src={el.data.image}
                          alt="Link preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-3.5 flex flex-col justify-between flex-1">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          {el.data.favicon && (
                            <img src={el.data.favicon} alt="" className="size-4 rounded shrink-0" />
                          )}
                          <h4 className="text-xs font-semibold text-white truncate">
                            {el.data.title || el.data.url}
                          </h4>
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

                {el.type === "palette" && (
                  <div className="p-4 rounded-2xl border border-white/20 bg-zinc-900/95 backdrop-blur-md shadow-xl">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-white/90">
                        {el.data.title || "Color Palette"}
                      </span>
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

                {el.type === "text" && (
                  <div className="p-2 border border-transparent hover:border-white/20 rounded-xl">
                    <input
                      type="text"
                      value={el.data.text || ""}
                      onChange={(e) => {
                        const newText = e.target.value;
                        setElements((prev) =>
                          prev.map((item) =>
                            item.id === el.id
                              ? { ...item, data: { ...item.data, text: newText } }
                              : item
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
              {/* Figma-like SVG Pointer */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                style={{ color: cursor.user.color }}
              >
                <path
                  d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
                  fill="currentColor"
                  stroke="white"
                  strokeWidth="1.5"
                />
              </svg>

              {/* Peer Name Tag */}
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
              if (["link", "video", "image"].includes(tool.id)) {
                // Open modal at center screen
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
          onClick={() => setZoom((z) => Math.max(z - 0.15, 0.2))}
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
      {/* 5. QUICK INSERT MODAL (LINK, VIDEO, IMAGE) */}
      {/* ------------------------------------------------------------- */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-white/15 p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-1">
              Add {modalType === "link" ? "Reference Link" : modalType === "video" ? "Video Embed" : "Image URL"}
            </h3>
            <p className="text-xs text-white/60 mb-4">
              {modalType === "link"
                ? "Paste any website or article URL to generate a smart card."
                : modalType === "video"
                ? "Paste a YouTube, Vimeo, Loom, or MP4 link."
                : "Paste an image URL to place onto your moodboard."}
            </p>

            <form onSubmit={handleModalSubmit} className="space-y-4">
              <input
                type="text"
                autoFocus
                required
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                placeholder="https://…"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/20 text-white text-sm focus:outline-none focus:border-emerald-400"
              />

              <div className="flex items-center justify-end gap-2">
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
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400"
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
