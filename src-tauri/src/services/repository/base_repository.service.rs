use std::sync::Arc;
use std::time::Instant;

use nosql_orm::provider::DatabaseProvider;
use nosql_orm::query::Filter;
use serde_json::{json, Value};

use crate::entities::response_entity::{DataValue, ResponseModel};
use crate::helpers::response_helper::{err_response, err_response_formatted, success_response};
use crate::helpers::security_helper::security_projection;
use crate::providers::data_provider::DataProvider;
use crate::providers::json_provider::JsonProvider;
use crate::providers::mongodb_provider::MongoProvider;
use crate::services::permission_service::PermissionService;

pub struct BaseRepository<T> {
    pub json_provider: JsonProvider,
    pub mongo_provider: Option<Arc<MongoProvider>>,
    _phantom: std::marker::PhantomData<T>,
}

impl<T> BaseRepository<T> {
    pub fn new(json_provider: JsonProvider, mongo_provider: Option<Arc<MongoProvider>>) -> Self {
        Self {
            json_provider,
            mongo_provider,
            _phantom: std::marker::PhantomData,
        }
    }

    pub fn with_mongo(json_provider: JsonProvider, mongo_provider: Arc<MongoProvider>) -> Self {
        Self {
            json_provider,
            mongo_provider: Some(mongo_provider),
            _phantom: std::marker::PhantomData,
        }
    }
}

impl<T> BaseRepository<T> {
    fn is_offline(&self) -> bool {
        std::env::var("OFFLINE_MODE").unwrap_or_default() == "true"
    }

    fn resolve_visibility(&self, visibility: Option<&str>, offline: bool) -> String {
        if let Some(vis) = visibility {
            return vis.to_string();
        }
        if offline {
            return "private".to_string();
        }
        "private".to_string()
    }

    fn use_json_provider_for_visibility(visibility: &str) -> bool {
        visibility == "private" || visibility == "all"
    }

    pub fn get_provider(
        &self,
        visibility: &str,
        offline_override: Option<bool>,
    ) -> Result<DataProvider, ResponseModel> {
        let offline = offline_override.unwrap_or_else(|| self.is_offline());
        let use_json = Self::use_json_provider_for_visibility(visibility) || offline;

        if use_json {
            Ok(DataProvider::Json(Arc::new(self.json_provider.clone())))
        } else {
            match self.mongo_provider.as_ref() {
                Some(p) => Ok(DataProvider::Mongo(p.clone())),
                None => Err(err_response(
                    "MongoDB not available - cannot access shared/team records. Please connect to the internet or change visibility to private.",
                )),
            }
        }
    }

    pub fn get_provider_for_table(
        &self,
        table: &str,
        visibility: &str,
        offline_override: Option<bool>,
    ) -> Result<DataProvider, ResponseModel> {
        let offline = offline_override.unwrap_or_else(|| self.is_offline());

        if offline || table == "daily_activities" {
            return Ok(DataProvider::Json(Arc::new(self.json_provider.clone())));
        }

        let use_json = Self::use_json_provider_for_visibility(visibility) || offline;

        if use_json {
            Ok(DataProvider::Json(Arc::new(self.json_provider.clone())))
        } else {
            match self.mongo_provider.as_ref() {
                Some(p) => Ok(DataProvider::Mongo(p.clone())),
                None => {
                    if visibility == "shared" || visibility == "public" || visibility == "all" {
                        Ok(DataProvider::Json(Arc::new(self.json_provider.clone())))
                    } else {
                        Err(err_response(
                            "MongoDB not available - cannot create shared/team records.",
                        ))
                    }
                }
            }
        }
    }

    pub fn resolve_visibility_for_offline(
        &self,
        visibility: Option<String>,
        offline_override: Option<bool>,
    ) -> String {
        if let Some(vis) = visibility {
            return vis;
        }
        let offline = offline_override.unwrap_or_else(|| self.is_offline());
        if offline {
            return "private".to_string();
        }
        "private".to_string()
    }

    pub fn apply_projection_recursive(&self, docs: Vec<Value>) -> Vec<Value> {
        let projection = security_projection();
        docs
            .into_iter()
            .map(|doc| projection.apply_recursive(&doc))
            .collect()
    }

    pub fn filter_deleted_docs(&self, docs: Vec<Value>) -> Vec<Value> {
        crate::helpers::common::filter_deleted(docs)
    }
}

pub trait CrudOperations<T>: Send + Sync {
    fn table_name(&self) -> &str;

    fn json_provider(&self) -> &JsonProvider;
    fn mongo_provider(&self) -> &Option<Arc<MongoProvider>>;

    fn base(&self) -> &BaseRepository<T>;

    fn apply_permission_filter(
        &self,
        filter: Option<Filter>,
        _user_id: &str,
        _visibility: Option<&str>,
    ) -> Option<Filter> {
        filter
    }

    fn check_permission_view(&self, _doc: &Value, _user_id: &str) -> Result<(), ResponseModel> {
        Ok(())
    }

    fn check_permission_create(&self, _data: &Value, _user_id: &str) -> Result<(), ResponseModel> {
        Ok(())
    }

    fn check_permission_update(
        &self,
        _existing: &Value,
        _data: &Value,
        _user_id: &str,
    ) -> Result<(), ResponseModel> {
        Ok(())
    }

    fn check_permission_delete(&self, _doc: &Value, _user_id: &str) -> Result<(), ResponseModel> {
        Ok(())
    }

    fn before_create(&self, _data: &mut Value, _user_id: &str) -> Result<(), ResponseModel> {
        Ok(())
    }

    fn after_create(&self, _doc: &Value) -> Result<(), ResponseModel> {
        Ok(())
    }

    fn before_update(
        &self,
        _existing: &Value,
        _data: &mut Value,
        _user_id: &str,
    ) -> Result<(), ResponseModel> {
        Ok(())
    }

    fn after_update(&self, _doc: &Value) -> Result<(), ResponseModel> {
        Ok(())
    }

    fn before_delete(&self, _doc: &Value) -> Result<(), ResponseModel> {
        Ok(())
    }

    fn after_delete(&self, _id: &str) -> Result<(), ResponseModel> {
        Ok(())
    }

    fn get_by_id(&self, id: &str, user_id: &str) -> Result<ResponseModel, ResponseModel> {
        let start = Instant::now();
        let base = self.base();

        let doc = base
            .json_provider
            .find_by_id(self.table_name(), id)
            .await?
            .ok_or_else(|| err_response(&format!("{} not found", self.table_name())))?;

        self.check_permission_view(&doc, user_id)?;

        let projection = security_projection();
        let projected = projection.apply_recursive(&doc);

        let _elapsed = start.elapsed();
        Ok(success_response(DataValue::Object(projected)))
    }

    fn get_all(
        &self,
        filter: Option<Filter>,
        user_id: &str,
        visibility: &str,
        skip: Option<u64>,
        limit: Option<u64>,
    ) -> Result<ResponseModel, ResponseModel> {
        let start = Instant::now();
        let base = self.base();

        let permission_filter = self.apply_permission_filter(filter, user_id, Some(visibility));

        let provider = base.get_provider(visibility, None)?;

        let docs = provider
            .find_many(self.table_name(), permission_filter.as_ref(), skip, limit, None, true)
            .await?;

        let filtered_docs = base.filter_deleted_docs(docs);
        let projected = base.apply_projection_recursive(filtered_docs);

        let _elapsed = start.elapsed();
        Ok(success_response(DataValue::Array(projected)))
    }

    fn create(&self, data: Value, user_id: &str, visibility: &str) -> Result<ResponseModel, ResponseModel> {
        let start = Instant::now();
        let base = self.base();

        let mut data_val = data;
        if let Some(obj) = data_val.as_object_mut() {
            obj.insert(
                "visibility".to_string(),
                serde_json::Value::String(visibility.to_string()),
            );
        }

        self.check_permission_create(&data_val, user_id)?;
        self.before_create(&mut data_val, user_id)?;

        let provider = base.get_provider_for_table(self.table_name(), visibility, None)?;
        let created = provider.insert(self.table_name(), data_val.clone()).await?;

        self.after_create(&created)?;

        let projection = security_projection();
        let response_doc = projection.apply_recursive(&created);

        let _elapsed = start.elapsed();
        let _id = created
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        Ok(success_response(DataValue::Object(response_doc)))
    }

    fn update(
        &self,
        id: &str,
        data: Value,
        user_id: &str,
        visibility: Option<&str>,
    ) -> Result<ResponseModel, ResponseModel> {
        let start = Instant::now();
        let base = self.base();

        let mut data_val = data;

        let new_visibility = data_val
            .get("visibility")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let visibility_str = visibility
            .map(|s| s.to_string())
            .or_else(|| {
                base.json_provider
                    .find_by_id(self.table_name(), id)
                    .await?
                    .and_then(|doc| doc.get("visibility").and_then(|v| v.as_str()).map(|s| s.to_string()))
            })
            .unwrap_or_else(|| "private".to_string());

        let provider = base.get_provider(&visibility_str, None)?;

        let existing = provider
            .find_by_id(self.table_name(), id)
            .await?
            .ok_or_else(|| err_response("Document not found"))?;

        self.check_permission_update(&existing, &data_val, user_id)?;
        self.before_update(&existing, &mut data_val, user_id)?;

        let merged_data = if let (Some(existing_obj), Some(update_obj)) =
            (existing.as_object(), data_val.as_object())
        {
            let mut merged = existing_obj.clone();
            for (k, v) in update_obj {
                merged.insert(k.clone(), v.clone());
            }
            serde_json::to_value(merged)
                .map_err(|e| err_response_formatted("Merge failed", &e.to_string()))?
        } else {
            data_val
        };

        let updated = provider.update(self.table_name(), id, merged_data).await?;

        self.after_update(&updated)?;

        let projection = security_projection();
        let response_doc = projection.apply_recursive(&updated);

        let _elapsed = start.elapsed();
        Ok(success_response(DataValue::Object(response_doc)))
    }

    fn delete(
        &self,
        id: &str,
        user_id: &str,
        soft: bool,
        visibility: Option<&str>,
    ) -> Result<ResponseModel, ResponseModel> {
        let start = Instant::now();
        let base = self.base();

        let visibility_str = visibility
            .map(|s| s.to_string())
            .unwrap_or_else(|| "private".to_string());

        let provider = base.get_provider(&visibility_str, None)?;

        let existing = provider
            .find_by_id(self.table_name(), id)
            .await?
            .ok_or_else(|| err_response("Document not found"))?;

        self.check_permission_delete(&existing, user_id)?;
        self.before_delete(&existing)?;

        if soft {
            let soft_delete_data = json!({ "deleted_at": chrono::Utc::now().to_rfc3339() });
            let _ = provider.update(self.table_name(), id, soft_delete_data).await;
        } else {
            let _ = provider.delete(self.table_name(), id).await;
        }

        self.after_delete(id)?;

        let _elapsed = start.elapsed();
        Ok(success_response(DataValue::String(id.to_string())))
    }
}

pub trait PermissionFiltering {
    fn apply_todo_permission_filter(
        filter: Option<Filter>,
        user_id: &str,
        visibility: Option<&str>,
    ) -> Option<Filter> {
        let permission_filter_json = PermissionService::get_todo_filter_for_user(user_id, visibility);
        let permission_filter = Filter::from_json(&permission_filter_json).ok();

        match (permission_filter, filter) {
            (Some(perm), Some(existing)) => Some(Filter::And(vec![perm, existing])),
            (Some(perm), None) => Some(perm),
            (None, existing) => existing,
        }
    }

    fn can_view_todo(doc: &Value, user_id: &str) -> bool {
        PermissionService::can_view_todo(doc, user_id)
    }

    fn can_edit_todo(doc: &Value, user_id: &str) -> bool {
        PermissionService::can_edit_todo(doc, user_id)
    }

    fn can_delete_todo(doc: &Value, user_id: &str) -> bool {
        PermissionService::can_delete_todo(doc, user_id)
    }

    fn can_add_task_to_todo(doc: &Value, user_id: &str) -> bool {
        PermissionService::can_add_task_to_todo(doc, user_id)
    }

    fn can_view_task(task: &Value, todo: Option<&Value>, user_id: &str) -> bool {
        if let Some(t) = todo {
            PermissionService::can_view_todo(t, user_id)
        } else {
            true
        }
    }

    fn can_edit_task(task: &Value, todo: &Value, user_id: &str) -> bool {
        PermissionService::can_edit_task(task, todo, user_id)
    }

    fn can_delete_task(task: &Value, todo: &Value, user_id: &str) -> bool {
        PermissionService::can_delete_task(task, todo, user_id)
    }
}

pub trait VisibilityResolution {
    fn resolve_visibility(data: &Value, visibility: Option<&str>, offline: bool) -> String {
        if let Some(vis) = visibility {
            return vis.to_string();
        }
        if let Some(serde_json::Value::String(vis_from_data)) = data.get("visibility") {
            return vis_from_data.clone();
        }
        if offline {
            return "private".to_string();
        }
        "private".to_string()
    }

    fn should_use_json(visibility: &str, offline: bool) -> bool {
        visibility == "private" || visibility == "all" || offline
    }

    fn validate_visibility_for_provider(visibility: &str, has_mongo: bool) -> Result<(), ResponseModel> {
        if visibility == "shared" || visibility == "public" || visibility == "all" {
            if !has_mongo {
                return Err(err_response(
                    "MongoDB not available - cannot create shared/team records. Please connect to the internet or change visibility to private.",
                ));
            }
        }
        Ok(())
    }
}

pub struct DefaultCrudOperations;

impl DefaultCrudOperations {
    pub fn merge_immutable_fields(existing: &Value, validated: &mut Value) {
        if let (Some(existing_obj), Some(validated_obj)) =
            (existing.as_object(), validated.as_object())
        {
            let mut merged = validated_obj.clone();
            for (k, v) in existing_obj {
                if k == "id" || k == "created_at" || k == "created_by" || k == "user_id" {
                    merged.insert(k.clone(), v.clone());
                }
            }
            *validated = serde_json::to_value(merged).unwrap_or_else(|_| validated.clone());
        }
    }
}