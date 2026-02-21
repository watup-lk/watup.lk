FROM postgres:16-alpine

# Metadata
LABEL project="watup.lk" \
      maintainers="Thilina D. Jayasuriya, Rashmi Liyanawadu, Nimna Fernando, Thamindu Gamage, Kushan Bhareti" \
      version="1.0"

# Automatically copy scripts to the init folder.
# Any .sql or .sh script here runs the FIRST time the volume is created.
COPY ./init-scripts/ /docker-entrypoint-initdb.d/
