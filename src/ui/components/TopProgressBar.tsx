import React, { useEffect, useState } from "react";

export type TopProgressController = { show: () => void; hide: () => void; set: (n: number) => void };
let singleton: TopProgressController | null = null;

export function useTopProgress() {
  return singleton;
}

export function getTopProgressController(): TopProgressController | null { return singleton; }

export function TopProgressBar() {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState(0);
  useEffect(() => {
    let timer: number | null = null;
  singleton = {
      show: () => { setActive(true); setValue(8); if (timer) window.clearInterval(timer); timer = window.setInterval(() => setValue((v) => Math.min(95, v + Math.random() * 7)), 300) as unknown as number; },
      hide: () => { if (timer) window.clearInterval(timer); timer = null; setValue(100); setTimeout(() => { setActive(false); setValue(0); }, 300); },
      set: (n: number) => setValue(Math.max(0, Math.min(100, n))),
    };
    return () => { if (timer) window.clearInterval(timer); singleton = null; };
  }, []);
  if (!active) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50" aria-hidden>
      <div className="h-0.5 bg-transparent">
        <div className="h-0.5 bg-blue-600 transition-[width] duration-200 ease-out" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default TopProgressBar;
