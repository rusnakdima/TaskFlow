use crate::entities::category_entity::CategoryEntity;
use crate::entities::chat_entity::ChatEntity;
use crate::entities::comment_entity::CommentEntity;
use crate::entities::profile_entity::ProfileEntity;
use crate::entities::subtask_entity::SubtaskEntity;
use crate::entities::task_entity::TaskEntity;
use crate::entities::todo_entity::TodoEntity;
use crate::entities::user_entity::UserEntity;

pub fn register_all_relations() {
    use nosql_orm::relations::register_relations_for_entity;
    
    register_relations_for_entity::<CategoryEntity>();
    register_relations_for_entity::<ChatEntity>();
    register_relations_for_entity::<CommentEntity>();
    register_relations_for_entity::<ProfileEntity>();
    register_relations_for_entity::<SubtaskEntity>();
    register_relations_for_entity::<TaskEntity>();
    register_relations_for_entity::<TodoEntity>();
    register_relations_for_entity::<UserEntity>();
}