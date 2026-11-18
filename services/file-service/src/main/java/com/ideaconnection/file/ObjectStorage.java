package com.ideaconnection.file;

interface ObjectStorage {
  String uploadUrl(FileRecord file);

  String readUrl(FileRecord file, boolean preview);

  long size(String key);

  void delete(String key);
}
