resource "cloudflare_pages_project" "immich_app" {
  account_id        = var.cloudflare_account_id
  name              = "immich-app"
  production_branch = "main"
}

output "immich_app_pages_project_name" {
  value = cloudflare_pages_project.immich_app.name
}

output "immich_app_pages_project_subdomain" {
  value = cloudflare_pages_project.immich_app.subdomain
}
