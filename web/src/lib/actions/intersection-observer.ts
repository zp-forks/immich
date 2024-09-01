type Config = IntersectionObserverActionProperties & {
  observer?: IntersectionObserver;
};
type TrackedProperties = {
  root?: Element | Document | null;
  threshold?: number | number[];
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
};
type OnIntersectCallback = (entryOrElement: IntersectionObserverEntry | HTMLElement) => unknown;
type OnSeperateCallback = (element: HTMLElement) => unknown;
type IntersectionObserverActionProperties = {
  key?: string;
  onSeparate?: OnSeperateCallback;
  onIntersect?: OnIntersectCallback;

  root?: Element | Document | null;
  threshold?: number | number[];
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;

  disabled?: boolean;
};
type TaskKey = HTMLElement | string;

function isEquivalent(a: TrackedProperties, b: TrackedProperties) {
  return (
    a?.bottom === b?.bottom &&
    a?.top === b?.top &&
    a?.left === b?.left &&
    a?.right == b?.right &&
    a?.threshold === b?.threshold &&
    a?.root === b?.root
  );
}

const elementToConfig = new Map<TaskKey, Config>();

const observe = (key: HTMLElement | string, target: HTMLElement, properties: IntersectionObserverActionProperties) => {
  if (!target.isConnected) {
    elementToConfig.get(key)?.observer?.unobserve(target);
    return;
  }
  const {
    root,
    threshold,
    top = '0px',
    right = '0px',
    bottom = '0px',
    left = '0px',
    onSeparate,
    onIntersect,
  } = properties;
  const rootMargin = `${top} ${right} ${bottom} ${left}`;
  const observer = new IntersectionObserver(
    (entries: IntersectionObserverEntry[]) => {
      // This IntersectionObserver is limited to observing a single element, the one the
      // action is attached to. If there are multiple entries, it means that this
      // observer is being notified of multiple events that have occured quickly together,
      // and the latest element is the one we are interested in.

      entries.sort((a, b) => a.time - b.time);

      const latestEntry = entries.pop();
      if (latestEntry?.isIntersecting) {
        onIntersect?.(latestEntry);
      } else {
        onSeparate?.(target);
      }
    },
    {
      rootMargin,
      threshold,
      root,
    },
  );
  observer.observe(target);
  elementToConfig.set(key, { ...properties, observer });
};

function configure(key: HTMLElement | string, element: HTMLElement, properties: IntersectionObserverActionProperties) {
  elementToConfig.set(key, properties);
  observe(key, element, properties);
}

function _intersectionObserver(
  key: HTMLElement | string,
  element: HTMLElement,
  properties: IntersectionObserverActionProperties,
) {
  if (properties.disabled) {
    properties.onIntersect?.(element);
  } else {
    configure(key, element, properties);
  }
  return {
    update(properties: IntersectionObserverActionProperties) {
      const config = elementToConfig.get(key);
      if (!config) {
        return;
      }
      if (isEquivalent(config, properties)) {
        return;
      }
      configure(key, element, properties);
    },
    destroy: () => {
      if (properties.disabled) {
        properties.onSeparate?.(element);
      } else {
        const config = elementToConfig.get(key);
        const { observer, onSeparate } = config || {};
        observer?.unobserve(element);
        elementToConfig.delete(key);
        if (onSeparate) {
          onSeparate?.(element);
        }
      }
    },
  };
}

export function intersectionObserver(
  element: HTMLElement,
  properties: IntersectionObserverActionProperties | IntersectionObserverActionProperties[],
) {
  // svelte doesn't allow multiple use:action directives of the same kind on the same element,
  // so accept an array when multiple configurations are needed.
  if (Array.isArray(properties)) {
    if (!properties.every((p) => p.key)) {
      throw new Error('Multiple configurations must specify key');
    }
    const observers = properties.map((p) => _intersectionObserver(p.key as string, element, p));
    return {
      update: (properties: IntersectionObserverActionProperties[]) => {
        for (const [i, props] of properties.entries()) {
          observers[i].update(props);
        }
      },
      destroy: () => {
        for (const observer of observers) {
          observer.destroy();
        }
      },
    };
  }
  return _intersectionObserver(element, element, properties);
}
