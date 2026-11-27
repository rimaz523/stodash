# linux_web_app
# https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/linux_web_app

resource "azurerm_linux_web_app" "webapp_linux" {
  name                = lower("${var.project}-${var.environment}-${var.stack}-${var.name}")
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = data.azurerm_service_plan.existing_rmz_asp.id
  https_only          = true

  site_config {
    always_on                         = var.always_on
    app_command_line                  = var.stack == "node" ? "pm2 serve /home/site/wwwroot --spa --no-daemon" : null
    ip_restriction_default_action     = "Allow"
    scm_ip_restriction_default_action = "Deny"

    application_stack {
      dotnet_version = var.stack == "dotnet" ? var.stack_version : null
      node_version   = var.stack == "node" ? var.stack_version : null
    }
  }

  identity {
    type = "SystemAssigned"
  }

  lifecycle {
    ignore_changes = [
      app_settings
    ]
  }
}

data "azurerm_service_plan" "existing_rmz_asp" {
  name                = "rimaz-dev-linux-asp"
  resource_group_name = "rimaz-app-dev-rg"
}