declare const document:
  | {
      querySelector(selector: string):
        | {
            getAttribute(name: string): string | null;
          }
        | null;
    }
  | undefined;
