export enum TypesField {
  OneToOne = "OneToOne",
  OneToMany = "OneToMany",
  ManyToOne = "ManyToOne",
  ManyToMany = "ManyToMany",
}

export interface RelationObj {
  nameTable: string;
  typeField: TypesField;
  nameField: string;
  newNameField: string;
  targetField?: string; // New: Column to join against in target table
  relations: RelationObj[] | null;
}
