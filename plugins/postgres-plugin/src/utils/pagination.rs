//! Pagination math for LIMIT/OFFSET queries.

/// Compute the SQL LIMIT and OFFSET for a given page and page size.
/// Pages are 1-indexed.
pub fn limit_offset(page: u32, page_size: u32) -> (u32, u32) {
    let offset = (page.saturating_sub(1)) * page_size;
    (page_size, offset)
}
