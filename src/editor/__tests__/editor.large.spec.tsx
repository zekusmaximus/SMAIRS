import React from "react";
import { describe, it, expect } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ManuscriptEditor } from "../Editor";

describe("ManuscriptEditor large document", () => {
  afterEach(() => cleanup());

  it("mounts under 800ms and exposes search API", async () => {
    const big = "Lorem ipsum dolor sit amet.\n".repeat(8000); // ~200k words approx lines
    const t0 = performance.now();
    const { container } = render(<div style={{ height: 600 }}><ManuscriptEditor initialText={big} /></div>);
    const dt = performance.now() - t0;
    expect(container.querySelector('[aria-label="Manuscript Editor"]')).toBeTruthy();
    expect(dt).toBeLessThan(800);
    // quick API check
  const apiU: unknown = (window as unknown as { manuscriptEditor?: unknown }).manuscriptEditor;
  expect(typeof apiU).toBe("object");
  const api = apiU as { find: (q: string) => number };
  const c = api.find("ipsum");
    expect(typeof c).toBe("number");
  });
});
