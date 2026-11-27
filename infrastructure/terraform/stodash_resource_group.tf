module "stodash_resource_group" {
  source   = "./modules/resource_group"
  for_each = var.resource_groups

  name        = each.key
  location    = each.value.location
  environment = var.environment
  project     = var.project
}
