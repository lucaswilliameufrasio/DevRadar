use rstar::{RTree, AABB, RTreeObject};
use std::sync::Arc;

#[derive(Debug, Clone, PartialEq)]
struct SpatialPoint {
    location: [f64; 2],
    client_id: Arc<String>,
}

impl RTreeObject for SpatialPoint {
    type Envelope = AABB<[f64; 2]>;

    fn envelope(&self) -> Self.Envelope {
        AABB::from_point(self.location)
    }
}

#[test]
fn test_rtree_indexing_and_search() {
    let mut tree = RTree::new();
    let client_id = Arc::new("client-1".to_string());
    let location = [-23.5505, -46.6333];
    
    tree.insert(SpatialPoint {
        location,
        client_id: client_id.clone(),
    });

    // Search in a 10km envelope (~0.15 degrees)
    let delta = 0.15;
    let envelope = AABB::from_corners(
        [location[0] - delta, location[1] - delta],
        [location[0] + delta, location[1] + delta],
    );

    let results: Vec<_> = tree.locate_in_envelope(&envelope).collect();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].client_id, client_id);
}

#[test]
fn test_rtree_removal() {
    let mut tree = RTree::new();
    let client_id = Arc::new("client-1".to_string());
    let location = [-23.5505, -46.6333];
    let point = SpatialPoint {
        location,
        client_id: client_id.clone(),
    };
    
    tree.insert(point.clone());
    assert_eq!(tree.size(), 1);
    
    tree.remove(&point);
    assert_eq!(tree.size(), 0);
}
