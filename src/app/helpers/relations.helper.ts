/* sys lib */
import { RelationObj, TypesField } from "@models/relation-obj.model";

export class RelationsHelper {
  private static todoRelations: RelationObj[] | null = null;
  private static todoRelationsWithUser: RelationObj[] | null = null;
  private static taskRelations: RelationObj[] | null = null;
  private static profileRelations: RelationObj[] | null = null;

  static getTodoRelations(): RelationObj[] {
    if (this.todoRelations) return this.todoRelations;

    this.todoRelations = [
      {
        nameTable: "tasks",
        typeField: TypesField.OneToMany,
        nameField: "todoId",
        newNameField: "tasks",
        relations: [
          {
            nameTable: "subtasks",
            typeField: TypesField.OneToMany,
            nameField: "taskId",
            newNameField: "subtasks",
            relations: [
              {
                nameTable: "comments",
                typeField: TypesField.OneToMany,
                nameField: "subtaskId",
                newNameField: "comments",
                relations: null,
              },
            ],
          },
          {
            nameTable: "comments",
            typeField: TypesField.OneToMany,
            nameField: "taskId",
            newNameField: "comments",
            relations: null,
          },
        ],
      },
      {
        nameTable: "categories",
        typeField: TypesField.ManyToOne,
        nameField: "categories",
        newNameField: "categories",
        relations: null,
      },
      {
        nameTable: "profiles",
        typeField: TypesField.ManyToOne,
        nameField: "assignees",
        newNameField: "assigneesProfiles",
        targetField: "userId",
        relations: [
          {
            nameTable: "users",
            typeField: TypesField.OneToOne,
            nameField: "userId",
            newNameField: "user",
            relations: null,
          },
        ],
      },
    ];
    return this.todoRelations;
  }

  static getTodoRelationsWithUser(): RelationObj[] {
    if (this.todoRelationsWithUser) return this.todoRelationsWithUser;

    this.todoRelationsWithUser = [
      {
        nameTable: "tasks",
        typeField: TypesField.OneToMany,
        nameField: "todoId",
        newNameField: "tasks",
        relations: [
          {
            nameTable: "subtasks",
            typeField: TypesField.OneToMany,
            nameField: "taskId",
            newNameField: "subtasks",
            relations: [
              {
                nameTable: "comments",
                typeField: TypesField.OneToMany,
                nameField: "subtaskId",
                newNameField: "comments",
                relations: null,
              },
            ],
          },
          {
            nameTable: "comments",
            typeField: TypesField.OneToMany,
            nameField: "taskId",
            newNameField: "comments",
            relations: null,
          },
        ],
      },
      {
        nameTable: "users",
        typeField: TypesField.OneToOne,
        nameField: "userId",
        newNameField: "user",
        relations: [
          {
            nameTable: "profiles",
            typeField: TypesField.OneToOne,
            nameField: "profileId",
            newNameField: "profile",
            relations: null,
          },
        ],
      },
      {
        nameTable: "categories",
        typeField: TypesField.ManyToOne,
        nameField: "categories",
        newNameField: "categories",
        relations: null,
      },
      {
        nameTable: "profiles",
        typeField: TypesField.ManyToOne,
        nameField: "assignees",
        newNameField: "assigneesProfiles",
        targetField: "userId",
        relations: [
          {
            nameTable: "users",
            typeField: TypesField.OneToOne,
            nameField: "userId",
            newNameField: "user",
            relations: null,
          },
        ],
      },
    ];
    return this.todoRelationsWithUser;
  }

  static getTaskRelations(): RelationObj[] {
    if (this.taskRelations) return this.taskRelations;

    this.taskRelations = [
      {
        nameTable: "subtasks",
        typeField: TypesField.OneToMany,
        nameField: "taskId",
        newNameField: "subtasks",
        relations: [
          {
            nameTable: "comments",
            typeField: TypesField.OneToMany,
            nameField: "subtaskId",
            newNameField: "comments",
            relations: null,
          },
        ],
      },
      {
        nameTable: "comments",
        typeField: TypesField.OneToMany,
        nameField: "taskId",
        newNameField: "comments",
        relations: null,
      },
    ];
    return this.taskRelations;
  }

  static getProfileRelations(): RelationObj[] {
    if (this.profileRelations) return this.profileRelations;

    this.profileRelations = [
      {
        nameTable: "users",
        typeField: TypesField.OneToOne,
        nameField: "userId",
        newNameField: "user",
        relations: null,
      },
    ];
    return this.profileRelations;
  }

  static getRelationsForTable(
    table: string,
    includeUser: boolean = false
  ): RelationObj[] | undefined {
    switch (table) {
      case "todos":
        return includeUser ? this.getTodoRelationsWithUser() : this.getTodoRelations();
      case "tasks":
        return this.getTaskRelations();
      case "profiles":
        return this.getProfileRelations();
      default:
        return undefined;
    }
  }
}
