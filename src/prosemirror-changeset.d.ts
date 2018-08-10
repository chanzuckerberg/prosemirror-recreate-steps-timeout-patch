declare module 'prosemirror-changeset' {
  import { StepMap } from "prosemirror-transform"
  import { Node, Slice } from "prosemirror-model"
  
  export class Span {
    public readonly from: number
    public readonly to: number
    public readonly data: any
  }
  
  export class DeletedSpan extends Span {
    public readonly pos: number
    public readonly slice: Slice
  }
  
  export type Metadata = any[] | {[key: string]: any}
  
  export class ChangeSet {
    public static create (doc: Node, object ?: { compare: (a: Metadata, b: Metadata) => boolean, combine ?: (a: Metadata) => Metadata})
    public readonly inserted: Span[]
    public readonly deleted: DeletedSpan[]
    public addSteps (newDoc: Node<any>, maps: ReadonlyArray<StepMap>, data: Metadata): ChangeSet
  }
}

