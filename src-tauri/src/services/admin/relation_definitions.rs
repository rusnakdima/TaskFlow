use crate::models::relation_obj::{RelationObj, TypesField};

pub fn getUserRelations() -> Vec<RelationObj> {
  vec![RelationObj {
    nameTable: "profiles".to_string(),
    typeField: TypesField::OneToOne,
    nameField: "profileId".to_string(),
    newNameField: "profile".to_string(),
    relations: None,
  }]
}

pub fn getTableRelations(table: &str) -> Option<Vec<RelationObj>> {
  match table {
    "profiles" => Some(vec![RelationObj {
      nameTable: "users".to_string(),
      typeField: TypesField::OneToOne,
      nameField: "userId".to_string(),
      newNameField: "user".to_string(),
      relations: None,
    }]),
    "todos" => Some(vec![
      RelationObj {
        nameTable: "users".to_string(),
        typeField: TypesField::OneToOne,
        nameField: "userId".to_string(),
        newNameField: "user".to_string(),
        relations: Some(vec![RelationObj {
          nameTable: "profiles".to_string(),
          typeField: TypesField::OneToOne,
          nameField: "profileId".to_string(),
          newNameField: "profile".to_string(),
          relations: None,
        }]),
      },
      RelationObj {
        nameTable: "categories".to_string(),
        typeField: TypesField::OneToMany,
        nameField: "categories".to_string(),
        newNameField: "categories_list".to_string(),
        relations: None,
      },
    ]),
    "categories" => Some(vec![RelationObj {
      nameTable: "users".to_string(),
      typeField: TypesField::OneToOne,
      nameField: "userId".to_string(),
      newNameField: "user".to_string(),
      relations: Some(vec![RelationObj {
        nameTable: "profiles".to_string(),
        typeField: TypesField::OneToOne,
        nameField: "profileId".to_string(),
        newNameField: "profile".to_string(),
        relations: None,
      }]),
    }]),
    "tasks" => Some(vec![RelationObj {
      nameTable: "todos".to_string(),
      typeField: TypesField::OneToOne,
      nameField: "todoId".to_string(),
      newNameField: "todo".to_string(),
      relations: None,
    }]),
    "subtasks" => Some(vec![RelationObj {
      nameTable: "tasks".to_string(),
      typeField: TypesField::OneToOne,
      nameField: "taskId".to_string(),
      newNameField: "task".to_string(),
      relations: None,
    }]),
    _ => None,
  }
}
