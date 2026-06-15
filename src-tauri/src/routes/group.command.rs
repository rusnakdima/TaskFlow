use crate::crud_route;

crud_route!(get_group, "groups", "get");
crud_route!(get_groups, "groups", "getAll");
crud_route!(create_group, "groups", "create");
crud_route!(update_group, "groups", "update");
crud_route!(delete_group, "groups", "delete");

use crate::entities::response_entity::ResponseModel;
use crate::helpers::auth_helper::extract_user_from_token;
use crate::helpers::response_helper::{err_response, success_response};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_group_by_room(
  state: State<'_, AppState>,
  room_id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.chat.group_service.get_by_room_id(&room_id).await
}

#[tauri::command]
pub async fn get_groups_cmd(
  state: State<'_, AppState>,
  user_id: String,
  token: Option<String>,
  visibility: Option<String>,
  page: Option<u64>,
  limit: Option<u64>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .ok();

  let visibility = visibility.unwrap_or_else(|| "all".to_string());
  let page = page.unwrap_or(0);
  let limit = limit.unwrap_or(crate::constants::MAX_PAGE_SIZE);

  let filter = serde_json::json!({
    "member_ids": { "$in": [user_id] }
  });

  state
    .chat
    .group_service
    .get_all(&visibility, Some(filter), Some(page * limit), Some(limit))
    .await
}

#[tauri::command]
pub async fn create_group_cmd(
  state: State<'_, AppState>,
  name: String,
  room_id: String,
  owner_id: String,
  member_ids: Option<Vec<String>>,
  avatar: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let mut members = member_ids.unwrap_or_default();
  if !members.contains(&owner_id) {
    members.push(owner_id.clone());
  }

  let data = serde_json::json!({
    "name": name,
    "room_id": room_id,
    "owner_id": owner_id,
    "member_ids": members,
    "avatar": avatar
  });

  state.chat.group_service.create(data, false).await
}

#[tauri::command]
pub async fn update_group_cmd(
  state: State<'_, AppState>,
  id: String,
  name: Option<String>,
  avatar: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let mut update_data = serde_json::json!({});
  if let Some(n) = name {
    update_data["name"] = serde_json::json!(n);
  }
  if let Some(a) = avatar {
    update_data["avatar"] = serde_json::json!(a);
  }

  if update_data
    .as_object()
    .map(|m| m.is_empty())
    .unwrap_or(false)
  {
    return Err(err_response("No update data provided"));
  }

  state.chat.group_service.update(&id, update_data).await
}

#[tauri::command]
pub async fn add_group_members(
  state: State<'_, AppState>,
  id: String,
  member_ids: Vec<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.chat.group_service.add_members(&id, member_ids).await
}

#[tauri::command]
pub async fn remove_group_members(
  state: State<'_, AppState>,
  id: String,
  member_ids: Vec<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state
    .chat
    .group_service
    .remove_members(&id, member_ids)
    .await
}

#[tauri::command]
pub async fn delete_group_cmd(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.chat.group_service.delete(&id).await
}

#[tauri::command]
pub async fn delete_group_cascade(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.chat.group_service.hard_delete_cascade(&id).await
}

#[tauri::command]
pub async fn get_messages_by_room(
  state: State<'_, AppState>,
  room_id: String,
  skip: Option<u64>,
  limit: Option<u64>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state
    .chat
    .chat_service
    .get_by_room(&room_id, skip, limit)
    .await
}

#[tauri::command]
pub async fn send_message(
  state: State<'_, AppState>,
  room_id: String,
  sender_id: String,
  receiver_id: Option<String>,
  dm_name: String,
  content: String,
  reply_id: Option<String>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let _ = state
    .chat
    .room_service
    .find_or_create_dm_room(
      &room_id,
      &sender_id,
      receiver_id.as_deref().unwrap_or(""),
      &dm_name,
    )
    .await;

  let mut data = serde_json::json!({
    "room_id": room_id,
    "sender_id": sender_id,
    "content": content,
    "read_by": [sender_id]
  });

  if let Some(ref rid) = reply_id {
    data["reply_id"] = serde_json::json!(rid);
  }

  state.chat.chat_service.create(data).await
}

#[tauri::command]
pub async fn ensure_rooms_for_groups(
  state: State<'_, AppState>,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  let filter = serde_json::json!({});
  let groups_result = state
    .chat
    .group_service
    .get_all(
      "all",
      Some(filter),
      Some(0),
      Some(crate::constants::MAX_GROUP_SIZE),
    )
    .await?;

  let groups = match &groups_result.data {
    serde_json::Value::Array(arr) => arr.clone(),
    _ => vec![],
  };

  let mut created_count = 0;
  let mut skipped_count = 0;

  for group in groups {
    let room_id = group.get("room_id").and_then(|v| v.as_str()).unwrap_or("");
    let group_name = group.get("name").and_then(|v| v.as_str()).map(String::from);
    let member_ids: Vec<String> = group
      .get("member_ids")
      .and_then(|v| v.as_array())
      .map(|arr| {
        arr
          .iter()
          .filter_map(|v| v.as_str().map(String::from))
          .collect()
      })
      .unwrap_or_default();

    if room_id.is_empty() {
      continue;
    }

    let existing_room = state.chat.room_service.get_by_room(room_id).await?;
    let room_exists = match &existing_room.data {
      serde_json::Value::Object(obj) => !obj.is_empty(),
      _ => false,
    };

    if room_exists {
      skipped_count += 1;
      continue;
    }

    let room_data = serde_json::json!({
      "name": group_name,
      "room": room_id,
      "is_group": true,
      "participant_ids": member_ids
    });

    let _ = state.chat.room_service.create(room_data).await?;
    created_count += 1;
  }

  Ok(success_response(serde_json::json!({
    "created": created_count,
    "skipped": skipped_count
  })))
}

#[tauri::command]
pub async fn mark_message_read(
  state: State<'_, AppState>,
  id: String,
  user_id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.chat.chat_service.mark_read(&id, &user_id).await
}

#[tauri::command]
pub async fn delete_message(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.chat.chat_service.delete(&id).await
}

#[tauri::command]
pub async fn hard_delete_message(
  state: State<'_, AppState>,
  id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.chat.chat_service.hard_delete(&id).await
}

#[tauri::command]
pub async fn edit_message(
  state: State<'_, AppState>,
  id: String,
  content: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.chat.chat_service.edit_message(&id, &content).await
}

#[tauri::command]
pub async fn add_message_reaction(
  state: State<'_, AppState>,
  message_id: String,
  emoji: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state
    .chat
    .chat_service
    .add_reaction(&message_id, &emoji, &user_id)
    .await
}

#[tauri::command]
pub async fn remove_message_reaction(
  state: State<'_, AppState>,
  message_id: String,
  emoji: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let user_id = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state
    .chat
    .chat_service
    .remove_reaction(&message_id, &emoji, &user_id)
    .await
}

#[tauri::command]
pub async fn delete_room_messages(
  state: State<'_, AppState>,
  room_id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.chat.chat_service.delete_by_room(&room_id).await
}

#[tauri::command]
pub async fn hard_delete_room_messages(
  state: State<'_, AppState>,
  room_id: String,
  token: Option<String>,
) -> Result<ResponseModel, ResponseModel> {
  let _ = extract_user_from_token(
    token.as_deref().unwrap_or(""),
    &state.config.config_helper.jwt_secret,
  )
  .map_err(|e| e)?;

  state.chat.chat_service.hard_delete_by_room(&room_id).await
}
