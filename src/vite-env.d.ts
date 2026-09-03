/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "clsx" {
  export type ClassValue =
    | ClassArray
    | ClassDictionary
    | string
    | number
    | bigint
    | null
    | boolean
    | undefined;
  export type ClassDictionary = Record<string, any>;
  export type ClassArray = ClassValue[];
  export function clsx(...inputs: ClassValue[]): string;
  export default clsx;
}

declare module "tailwind-merge" {
  export function twMerge(...classLists: any[]): string;
}
