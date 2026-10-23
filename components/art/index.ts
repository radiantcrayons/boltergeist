import type { ComponentType } from "react";
import type { Role } from "@/lib/game/war";
import { Bear } from "./Bear";
import { Bolt } from "./Bolt";
import { Bull } from "./Bull";
import { Spark } from "./Spark";
import { Strike } from "./Strike";
import type { ArtProps } from "./types";

export const HEROES: Record<Role, ComponentType<ArtProps>> = { soldier: Spark, commando: Bolt, warlord: Strike };
export const FOES = { bears: Bear, bulls: Bull } as const;

export { Bear, Bolt, Bull, Spark, Strike };
export type { ArtProps, Mood } from "./types";
