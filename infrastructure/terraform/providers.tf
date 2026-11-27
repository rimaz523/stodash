terraform {
  required_version = ">=1.17.1"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">=5.15.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "stodash-admin-rg"
    storage_account_name = "stodashadminstore"
    container_name       = "tfstate"
    key                  = "#{terraform-state-key}#"
  }

}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}