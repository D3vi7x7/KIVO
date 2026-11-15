"use client";

import * as React from "react";

const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 4000;

type ActionType = {
  label: string;
  onClick: () => void;
};

type Toast = {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ActionType;
};

type ToastState = {
  toasts: Toast[];
};

type ToastAction =
  | { type: "ADD_TOAST"; toast: Toast }
  | { type: "UPDATE_TOAST"; toastId: string; toast: Partial<Toast> }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string };

let count = 0;
function genId() {
  count = (count + 1) % TOAST_LIMIT;
  return count.toString();
}

function reducer(state: ToastState, action: ToastAction): ToastState {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };
    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toastId ? { ...t, ...action.toast } : t,
        ),
      };
    case "DISMISS_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          action.toastId === undefined || t.id === action.toastId
            ? { ...t, open: false }
            : t,
        ),
      };
    case "REMOVE_TOAST":
      if (action.toastId === undefined) return { ...state, toasts: [] };
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
    default:
      return state;
  }
}

type ToastProviderProps = {
  children: React.ReactNode;
};

function ToastProvider({ children }: ToastProviderProps) {
  const [state, dispatch] = React.useReducer(reducer, { toasts: [] });

  return (
    <ToastContext.Provider value={{ state, dispatch }}>
      {children}
      <div
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
        style={{ pointerEvents: "auto" }}
      >
        {state.toasts.map((t) => (
          <ToastItem key={t.id} toast={t} dispatch={dispatch} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ToastContext = React.createContext<{
  state: ToastState;
  dispatch: React.Dispatch<ToastAction>;
} | undefined>(undefined);

function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  const { state, dispatch } = context;

  const createToast = (props: Omit<Toast, "id">) => {
    const id = genId();
    dispatch({ type: "ADD_TOAST", toast: { ...props, id } });

    const update = (updates: Partial<Omit<Toast, "id">>) =>
      dispatch({ type: "UPDATE_TOAST", toastId: id, toast: updates });
    const dismiss = () =>
      dispatch({ type: "DISMISS_TOAST", toastId: id });

    return { id, dismiss, update };
  };

  return { toast: createToast, toasts: state.toasts };
}

function ToastItem({
  toast,
  dispatch,
}: {
  toast: Toast;
  dispatch: React.Dispatch<ToastAction>;
}) {
  const [open, setOpen] = React.useState(true);

  // Auto-remove after delay
  React.useEffect(() => {
    const timer = setTimeout(() => {
      dispatch({ type: "REMOVE_TOAST", toastId: toast.id });
    }, TOAST_REMOVE_DELAY);
    return () => clearTimeout(timer);
  }, [dispatch, toast.id]);

  if (!open) return null;

  return (
    <div
      className="m-4 w-full max-w-md rounded-lg border border-gray-200 bg-white p-4 shadow-lg animate-in fade-in slide-in-from-right-2 duration-300"
      role="alert"
    >
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3 w-0 flex-1 pt-0.5">
          {toast.title && (
            <h1 className="text-sm font-semibold text-gray-900">{toast.title}</h1>
          )}
          {toast.description && (
            <p className="mt-1 text-sm text-gray-500">{toast.description}</p>
          )}
        </div>
        <div className="ml-auto pl-3">
          <div className="flex items-center gap-2">
            {toast.action && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.action!.onClick();
                  dispatch({ type: "DISMISS_TOAST", toastId: toast.id });
                }}
                className="inline-flex items-center justify-center rounded-md bg-white px-3 py-1 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-900/10 hover:bg-gray-50"
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                dispatch({ type: "DISMISS_TOAST", toastId: toast.id });
              }}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-900"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.714a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              <span className="sr-only">Close</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { useToast, ToastProvider };
