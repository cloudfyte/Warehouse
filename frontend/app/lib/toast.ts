"use client";
import { useState, useEffect } from "react";

export type ToastLevel = "success" | "error" | "info" | "warn";
export interface ToastItem { id: number; msg: string; level: ToastLevel }

let _counter = 0;
let _items: ToastItem[] = [];
const _subs = new Set<(items: ToastItem[]) => void>();

function _publish() { _subs.forEach(fn => fn([..._items])); }

export function showToast(msg: string, level: ToastLevel = "success", duration = 3500) {
  const id = ++_counter;
  _items = [..._items, { id, msg, level }];
  _publish();
  setTimeout(() => { _items = _items.filter(i => i.id !== id); _publish(); }, duration);
}

export function useToasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    _subs.add(setItems);
    return () => { _subs.delete(setItems); };
  }, []);
  return items;
}
