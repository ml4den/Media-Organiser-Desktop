import type { OrganiseSettings } from "../src/lib/media-types";
export function mediaKind(name: string): "photo" | "video" | "other";
export function validateTemplate(template: string): string | null;
export function formatFolder(template: string, date: Date, kind?: string): string;
export function exclusionReason(path: string, settings: OrganiseSettings): string | null;
export function validateSettings(settings: OrganiseSettings): void;
export function parseMetadataDate(value: unknown): Date | null;
export function dateString(date: Date): string;
export function numberedName(name: string, index: number): string;
