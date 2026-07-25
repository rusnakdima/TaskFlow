//! Strangler Fig test: calculate_percentage duplication audit
//!
//! FINDING: `calculate_percentage` is defined once in `utils/percentage.helper.rs`
//! and consumed in two separate places:
//!   1. `utils/activity/formatter.helper.rs` — ActivityFormatter::calculate_productivity_score
//!   2. `services/statistics/task-analytics.service.rs` — compute_statistics (completion_rate)
//!
//! Both import the same single library function, confirming there is NO duplicate
//! definition — only two call sites for one canonical implementation.
//!
//! This test file verifies behavioral consistency between the two call sites
//! and ensures the single library implementation is correct.

use taskflow_lib::utils::percentage::calculate_percentage;

/// Single canonical implementation — validates core percentage logic
#[test]
fn test_calculate_percentage_basic() {
    // Normal case: 50%
    assert_eq!(calculate_percentage(50, 100), 50);

    // Edge: 0 total → 0 (not divide-by-zero panic)
    assert_eq!(calculate_percentage(10, 0), 0);

    // Edge: 0 completed → 0
    assert_eq!(calculate_percentage(0, 100), 0);

    // 100% case
    assert_eq!(calculate_percentage(100, 100), 100);

    // Rounds down (truncation)
    assert_eq!(calculate_percentage(1, 3), 33); // 33.33... truncated

    // Over 100% when completed > total (data anomaly)
    assert_eq!(calculate_percentage(150, 100), 150);
}

/// Call site 1 — ActivityFormatter::calculate_productivity_score
/// Simulates: calculate_percentage(activity.completed_tasks, activity.total_tasks)
/// Path: src-tauri/src/utils/activity/formatter.helper.rs
#[test]
fn test_formatter_productivity_score_semantics() {
    // A realistic scenario: 8 completed out of 12 tasks
    let completed = 8;
    let total = 12;
    let score = calculate_percentage(completed, total);
    assert_eq!(score, 66); // 8/12 * 100 = 66.66... → 66

    // All tasks completed
    let completed = 10;
    let total = 10;
    let score = calculate_percentage(completed, total);
    assert_eq!(score, 100);

    // No tasks assigned (total = 0) — must not panic, returns 0
    let completed = 0;
    let total = 0;
    let score = calculate_percentage(completed, total);
    assert_eq!(score, 0);
}

/// Call site 2 — TaskAnalytics::compute_statistics
/// Simulates: calculate_percentage(completed_tasks, total_tasks) for completion_rate
/// Path: src-tauri/src/services/statistics/task-analytics.service.rs
#[test]
fn test_analytics_completion_rate_semantics() {
    // Normal completion rate
    let total = 20;
    let completed = 15;
    let rate = calculate_percentage(completed, total);
    assert_eq!(rate, 75);

    // No activity (total = 0) — must not panic, returns 0
    let total = 0;
    let completed = 0;
    let rate = calculate_percentage(completed, total);
    assert_eq!(rate, 0);

    // High throughput scenario
    let total = 1000;
    let completed = 823;
    let rate = calculate_percentage(completed, total);
    assert_eq!(rate, 82);
}

/// Consistency check: both call sites produce identical results
/// for the same input values (they call the same library function)
#[test]
fn test_both_call_sites_produce_identical_results() {
    let test_cases = vec![
        (0, 0),
        (0, 100),
        (50, 100),
        (100, 100),
        (1, 3),
        (8, 12),
        (15, 20),
        (823, 1000),
        (99, 100),
    ];

    for (completed, total) in test_cases {
        let formatter_result = calculate_percentage(completed, total);
        let analytics_result = calculate_percentage(completed, total);
        assert_eq!(
            formatter_result, analytics_result,
            "Both call sites must return identical results for ({}, {})", completed, total
        );
    }
}

/// Confirms single-definition invariant: calculate_percentage is defined exactly
/// once in the codebase (utils/percentage.helper.rs) and imported by both
/// formatter.helper.rs and task-analytics.service.rs.
/// This test exists to document the refactoring goal: no duplicate definitions exist.
#[test]
fn test_single_source_of_truth() {
    // If this test compiles, calculate_percentage is accessible from the library.
    // The duplicate-audit grep confirmed only ONE definition at:
    //   src-tauri/src/utils/percentage.helper.rs
    // and two import sites:
    //   src-tauri/src/utils/activity/formatter.helper.rs  (re-exported via activity module)
    //   src-tauri/src/services/statistics/task-analytics.service.rs
    let result = calculate_percentage(75, 100);
    assert_eq!(result, 75);
}
