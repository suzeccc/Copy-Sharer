import englishCatalog from "../../locales/en-US.json" with { type: "json" };

import type { UiLanguage } from "@/types/config";

export type EffectiveLocale = "zh-CN" | "en-US";

const HAN_PATTERN = /[\u3400-\u9fff]/u;
const LOCALIZED_ATTRIBUTES = ["aria-label", "placeholder", "title"] as const;
const TEXT_IGNORE_SELECTOR = [
  "[data-i18n-ignore]",
  "code",
  "pre",
  "script",
  "style",
  "textarea",
  "[contenteditable='true']",
].join(",");
const ATTRIBUTE_IGNORE_SELECTOR = "[data-i18n-ignore]";
const english = englishCatalog as Record<string, string>;
const phrasePattern = new RegExp(
  Object.keys(english)
    .filter((phrase) => english[phrase] !== phrase)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|"),
  "gu",
);

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();

let preference: UiLanguage = "system";
let effectiveLocale: EffectiveLocale = resolveUiLanguage(preference);
let observer: MutationObserver | undefined;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveUiLanguage(
  language: UiLanguage,
  systemLanguage = typeof navigator === "undefined" ? "en-US" : navigator.language,
): EffectiveLocale {
  if (language === "zh-CN" || language === "en-US") {
    return language;
  }
  return systemLanguage.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function getUiLanguage(): UiLanguage {
  return preference;
}

export function getEffectiveLocale(): EffectiveLocale {
  return effectiveLocale;
}

export function translateSource(value: string, locale = effectiveLocale): string {
  if (locale === "zh-CN" || !HAN_PATTERN.test(value)) {
    return value;
  }
  HAN_PATTERN.lastIndex = 0;
  return value
    .replace(phrasePattern, (phrase) => english[phrase] ?? phrase)
    .replaceAll("，", ", ")
    .replaceAll("。", ".")
    .replaceAll("：", ": ")
    .replaceAll("、", ", ")
    .replaceAll("；", "; ")
    .replaceAll("？", "?")
    .replaceAll("！", "!");
}

function textShouldBeIgnored(node: Text): boolean {
  return node.parentElement?.closest(TEXT_IGNORE_SELECTOR) !== null;
}

function attributesShouldBeIgnored(element: Element): boolean {
  return element.closest(ATTRIBUTE_IGNORE_SELECTOR) !== null;
}

function localizeTextNode(node: Text): void {
  if (textShouldBeIgnored(node)) {
    return;
  }

  if (effectiveLocale === "zh-CN") {
    const source = originalText.get(node);
    if (source !== undefined && node.data !== source) {
      node.data = source;
    }
    originalText.delete(node);
    return;
  }

  const current = node.data;
  if (HAN_PATTERN.test(current)) {
    HAN_PATTERN.lastIndex = 0;
    originalText.set(node, current);
    const translated = translateSource(current);
    if (translated !== current) {
      node.data = translated;
    }
  }
}

function localizeElementAttributes(element: Element): void {
  if (attributesShouldBeIgnored(element)) {
    return;
  }

  const stored = originalAttributes.get(element);
  if (effectiveLocale === "zh-CN") {
    if (!stored) return;
    for (const [name, value] of stored) {
      element.setAttribute(name, value);
    }
    originalAttributes.delete(element);
    return;
  }

  for (const name of LOCALIZED_ATTRIBUTES) {
    const current = element.getAttribute(name);
    if (!current || !HAN_PATTERN.test(current)) {
      HAN_PATTERN.lastIndex = 0;
      continue;
    }
    HAN_PATTERN.lastIndex = 0;
    let originals = originalAttributes.get(element);
    if (!originals) {
      originals = new Map();
      originalAttributes.set(element, originals);
    }
    originals.set(name, current);
    element.setAttribute(name, translateSource(current));
  }
}

function localizeSubtree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    localizeTextNode(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) {
    return;
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    localizeElementAttributes(root as Element);
  }
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      localizeTextNode(current as Text);
    } else {
      localizeElementAttributes(current as Element);
    }
    current = walker.nextNode();
  }
}

function observeDocument(): void {
  if (!document.documentElement) return;
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    observer?.disconnect();
    for (const record of records) {
      if (record.type === "characterData") {
        localizeTextNode(record.target as Text);
      } else if (record.type === "attributes") {
        localizeElementAttributes(record.target as Element);
      } else {
        for (const node of record.addedNodes) {
          localizeSubtree(node);
        }
      }
    }
    observeDocument();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [...LOCALIZED_ATTRIBUTES],
    characterData: true,
    childList: true,
    subtree: true,
  });
}

function applyLocaleToDocument(): void {
  if (!document.documentElement) return;
  observer?.disconnect();
  document.documentElement.lang = effectiveLocale;
  localizeSubtree(document.documentElement);
  observeDocument();
}

export function setUiLanguage(language: UiLanguage): void {
  preference = language;
  effectiveLocale = resolveUiLanguage(language);
  applyLocaleToDocument();
  window.dispatchEvent(new CustomEvent("copyshare-locale-changed", {
    detail: { language, locale: effectiveLocale },
  }));
}

export function initializeI18n(language: UiLanguage): void {
  setUiLanguage(language);
}
