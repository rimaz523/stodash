module "linux_web_app" {
  source   = "./modules/linux_web_app"
  for_each = var.linux_webapps

  resource_group_name = module.stodash_resource_group["app"].name
  location            = module.stodash_resource_group["app"].location
  environment         = var.environment
  project             = var.project
  name                = each.key
  stack               = each.value.stack
  stack_version       = each.value.stack_version
  always_on           = each.value.always_on

  depends_on = [
    module.stodash_resource_group["app"].id
  ]
}
